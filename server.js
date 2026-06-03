const express = require('express')
const { MongoClient, ObjectId } = require('mongodb')
const path = require('path')
const fs = require('fs')

const app = express()
const PORT = process.env.PORT || 3000
const URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017'
const DB = 'football_db'

app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

let db // глобальный handle на БД

// Подключение к MongoDB + начальный импорт данных
async function connectDB() {
	const client = new MongoClient(URI)
	await client.connect()
	db = client.db(DB)
	console.log(`MongoDB: подключено → ${DB}`)
	await seedCollection('players', 'players.json')
	await seedCollection('matches', 'matches.json')
	await seedCollection('users', 'users.json')
}

async function seedCollection(colName, filename) {
	const col = db.collection(colName)
	const count = await col.countDocuments()
	if (count > 0) {
		console.log(
			`${colName}: уже содержит ${count} документов, пропускаем импорт`,
		)
		return
	}
	const file = path.join(__dirname, filename)
	if (!fs.existsSync(file)) {
		console.warn(`Файл не найден: ${filename}`)
		return
	}
	const docs = JSON.parse(fs.readFileSync(file, 'utf-8'))
	await col.insertMany(docs)
	console.log(
		`${colName}: импортировано ${docs.length} документов из ${filename}`,
	)
}

// Обёртка для async-обработчиков (централизованная обработка ошибок)
const wrap = (fn) => (req, res) =>
	fn(req, res).catch((err) => {
		console.error('API Error:', err.message)
		res.status(500).json({ error: err.message })
	})

// DASHBOARD — сводная статистика
app.get(
	'/api/overview',
	wrap(async (req, res) => {
		const [players, matches, users] = await Promise.all([
			db.collection('players').countDocuments(),
			db.collection('matches').countDocuments(),
			db.collection('users').countDocuments(),
		])
		const agg = await db
			.collection('players')
			.aggregate([{ $group: { _id: null, total: { $sum: '$stats.goals' } } }])
			.toArray()
		res.json({ players, matches, users, totalGoals: agg[0]?.total ?? 0 })
	}),
)

// PLAYERS — маршруты
// Топ-N бомбардиров (GET /api/players/top?limit=5)
app.get(
	'/api/players/top',
	wrap(async (req, res) => {
		const limit = parseInt(req.query.limit) || 5
		const list = await db
			.collection('players')
			.find(
				{},
				{
					projection: {
						name: 1,
						team: 1,
						nationality: 1,
						position: 1,
						jerseyNumber: 1,
						'stats.goals': 1,
						'stats.assists': 1,
					},
				},
			)
			.sort({ 'stats.goals': -1 })
			.limit(limit)
			.toArray()
		res.json(list)
	}),
)

// Поиск по имени (GET /api/players/search?name=Messi)
app.get(
	'/api/players/search',
	wrap(async (req, res) => {
		const { name, position } = req.query
		if (!name) return res.status(400).json({ error: 'Введите имя для поиска' })
		const query = { name: { $regex: name, $options: 'i' } }
		if (position) query.position = position
		const list = await db.collection('players').find(query).toArray()
		res.json(list)
	}),
)

// Голы по командам, агрегация (GET /api/players/stats/by-team)
app.get(
	'/api/players/stats/by-team',
	wrap(async (req, res) => {
		const list = await db
			.collection('players')
			.aggregate([
				{
					$group: {
						_id: '$team',
						totalGoals: { $sum: '$stats.goals' },
						playerCount: { $sum: 1 },
					},
				},
				{ $sort: { totalGoals: -1 } },
			])
			.toArray()
		res.json(list)
	}),
)

// Все игроки с фильтром по позиции (GET /api/players?position=Forward)
app.get(
	'/api/players',
	wrap(async (req, res) => {
		const filter = req.query.position ? { position: req.query.position } : {}
		const list = await db
			.collection('players')
			.find(filter)
			.sort({ 'stats.goals': -1 })
			.toArray()
		res.json(list)
	}),
)

// +1 гол игроку — атомарный $inc в MongoDB
app.put(
	'/api/players/:name/goal',
	wrap(async (req, res) => {
		const name = decodeURIComponent(req.params.name)
		const result = await db
			.collection('players')
			.updateOne({ name }, { $inc: { 'stats.goals': 1 } })
		if (!result.matchedCount)
			return res.status(404).json({ error: 'Игрок не найден' })
		res.json({ ok: true })
	}),
)

// Заблокировать комментарий у игрока
app.put(
	'/api/players/:name/ban-comment',
	wrap(async (req, res) => {
		const name = decodeURIComponent(req.params.name)
		const { author } = req.body
		if (!author) return res.status(400).json({ error: 'Укажите автора' })

		const result = await db.collection('players').updateOne(
			{ name },
			{ $set: { 'comments.$[elem].banned': true } },
			{ arrayFilters: [{ 'elem.author': author }] }, // ИСПРАВЛЕНО
		)
		if (!result.matchedCount)
			return res.status(404).json({ error: 'Игрок не найден' })
		if (!result.modifiedCount)
			return res.status(404).json({ error: 'Комментарий не найден' })
		res.json({ ok: true })
	}),
)

// MATCHES — маршруты
// Голы по командам в матчах: $unwind + $group
app.get(
	'/api/matches/stats/goals-by-team',
	wrap(async (req, res) => {
		const list = await db
			.collection('matches')
			.aggregate([
				{ $unwind: '$events' },
				{ $match: { 'events.type': 'goal' } },
				{ $group: { _id: '$events.team', goals: { $sum: 1 } } },
				{ $sort: { goals: -1 } },
			])
			.toArray()
		res.json(list)
	}),
)

// Все матчи с фильтром по турниру
app.get(
	'/api/matches',
	wrap(async (req, res) => {
		const filter = req.query.tournament
			? { tournament: req.query.tournament }
			: {}
		const list = await db
			.collection('matches')
			.find(filter)
			.sort({ date: -1 })
			.toArray()
		res.json(list)
	}),
)

// Добавить новый матч — реальная вставка insertOne в MongoDB
app.post(
	'/api/matches',
	wrap(async (req, res) => {
		const {
			homeTeam,
			awayTeam,
			date,
			tournament,
			season,
			stadium,
			attendance,
			scoreHome,
			scoreAway,
		} = req.body
		if (!homeTeam || !awayTeam || !date || !tournament)
			return res.status(400).json({ error: 'Заполните обязательные поля (*)' })

		const doc = {
			homeTeam,
			awayTeam,
			date: new Date(date),
			tournament,
			season: season || '2024/2025',
			stadium: stadium || '',
			attendance: Number(attendance) || 0,
			score: { home: Number(scoreHome) || 0, away: Number(scoreAway) || 0 },
			lineups: { home: [], away: [] },
			events: [],
			comments: [],
		}
		const { insertedId } = await db.collection('matches').insertOne(doc)
		res.status(201).json({ ok: true, insertedId, match: doc })
	}),
)

// Заблокировать комментарий к матчу
app.put(
	'/api/matches/:id/ban-comment',
	wrap(async (req, res) => {
		const { author } = req.body
		if (!author) return res.status(400).json({ error: 'Укажите автора' })

		let _id
		try {
			_id = new ObjectId(req.params.id)
		} catch {
			return res.status(400).json({ error: 'Неверный ID матча' })
		}

		const result = await db
			.collection('matches')
			.updateOne(
				{ _id },
				{ $set: { 'comments.$[elem].banned': true } },
				{ arrayFilters: [{ 'elem.author': author }] },
			)
		if (!result.matchedCount)
			return res.status(404).json({ error: 'Матч не найден' })
		if (!result.modifiedCount)
			return res.status(404).json({ error: 'Комментарий не найден' })
		res.json({ ok: true })
	}),
)

// USERS — маршруты
// Все пользователи (без хэшей паролей)
app.get(
	'/api/users',
	wrap(async (req, res) => {
		const list = await db
			.collection('users')
			.find({}, { projection: { passwordHash: 0 } })
			.sort({ role: 1, commentCount: -1 })
			.toArray()
		res.json(list)
	}),
)

// Заблокировать пользователя
app.put(
	'/api/users/:username/ban',
	wrap(async (req, res) => {
		const { reason } = req.body
		const result = await db.collection('users').updateOne(
			{ username: req.params.username },
			{
				$set: {
					isBanned: true,
					banReason: reason || 'Нарушение правил',
					bannedAt: new Date(),
					bannedBy: 'admin_football',
				},
			},
		)
		if (!result.matchedCount)
			return res.status(404).json({ error: 'Пользователь не найден' })
		res.json({ ok: true })
	}),
)

// Старт сервера
app.listen(PORT, async () => {
	try {
		await connectDB()
		console.log(`\nОткрыть в браузере: http://localhost:${PORT}`)
	} catch (e) {
		console.error('Ошибка при запуске:', e.message)
		process.exit(1)
	}
})
