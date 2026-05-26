const express = require('express')
const { MongoClient } = require('mongodb')

const app = express()
const uri = 'mongodb://127.0.0.1:27017'
let db

app.set('view engine', 'ejs')
app.use(express.static('public'))
app.use(express.urlencoded({ extended: true }))

// Подключение к БД и запуск сервера
MongoClient.connect(uri)
	.then((client) => {
		db = client.db('journal')
		console.log('🔗 MongoDB подключена')

		app.listen(3000, () => {
			console.log('🌐 Сервер запущен: http://localhost:3000')
		})
	})
	.catch((err) => {
		console.error('❌ Ошибка подключения к MongoDB:', err)
		console.log('💡 Убедитесь, что MongoDB запущена: mongod')
	})

// 🔹 Корневой маршрут — отдаёт главную страницу
app.get('/', (_, res) => {
	res.render('index')
})

// 🔹 API: список уникальных авторов
app.get('/api/authors', async (_, res) => {
	try {
		const authors = await db.collection('articles').distinct('authors')
		res.json(authors.sort())
	} catch (e) {
		res.status(500).json({ error: e.message })
	}
})

// 🔹 API: список статей (кратко)
app.get('/api/articles', async (_, res) => {
	try {
		const articles = await db
			.collection('articles')
			.find({}, { projection: { _id: 1, title: 1, authors: 1, date: 1 } })
			.sort({ date: -1 })
			.toArray()
		res.json(articles)
	} catch (e) {
		res.status(500).json({ error: e.message })
	}
})

// 🔹 API: поиск по названию
app.get('/api/search/title', async (req, res) => {
	try {
		const q = req.query.q || ''
		const articles = await db
			.collection('articles')
			.find(
				{ title: { $regex: q, $options: 'i' } },
				{ projection: { _id: 1, title: 1, authors: 1, date: 1 } },
			)
			.sort({ date: -1 })
			.toArray()
		res.json(articles)
	} catch (e) {
		res.status(500).json({ error: e.message })
	}
})

// 🔹 API: поиск по автору
app.get('/api/search/author', async (req, res) => {
	try {
		const a = req.query.a || ''
		const articles = await db
			.collection('articles')
			.find(
				{ authors: a },
				{ projection: { _id: 1, title: 1, authors: 1, date: 1 } },
			)
			.sort({ date: -1 })
			.toArray()
		res.json(articles)
	} catch (e) {
		res.status(500).json({ error: e.message })
	}
})
