const express = require('express')
const { MongoClient, ObjectId } = require('mongodb')
const app = express()

app.set('view engine', 'ejs')
app.use(express.urlencoded({ extended: true }))
app.use(express.static('public'))

const uri = 'mongodb://127.0.0.1:27017'
let db

MongoClient.connect(uri)
	.then((client) => {
		db = client.db('journal')
		app.listen(3000, () => console.log('🌐 http://localhost:3000'))
	})
	.catch(console.error)

// Маршруты
app.get('/', (_, res) => res.render('index'))
app.get('/create', (_, res) => res.render('create'))
app.get('/article/:id', async (req, res) => {
	const article = await db
		.collection('articles')
		.findOne({ _id: new ObjectId(req.params.id) })
	if (!article) return res.status(404).send('Статья не найдена')
	res.render('article', { article })
})

// API
app.get('/api/authors', async (_, res) =>
	res.json(await db.collection('articles').distinct('authors').sort()),
)
app.get('/api/articles', async (_, res) =>
	res.json(
		await db
			.collection('articles')
			.find({}, { projection: { _id: 1, title: 1, authors: 1, date: 1 } })
			.sort({ date: -1 })
			.toArray(),
	),
)
app.get('/api/search/title', async (req, res) => {
	const q = req.query.q || ''
	res.json(
		await db
			.collection('articles')
			.find(
				{ title: { $regex: q, $options: 'i' } },
				{ projection: { _id: 1, title: 1, authors: 1, date: 1 } },
			)
			.toArray(),
	)
})
app.get('/api/search/author', async (req, res) => {
	const a = req.query.a || ''
	res.json(
		await db
			.collection('articles')
			.find(
				{ authors: a },
				{ projection: { _id: 1, title: 1, authors: 1, date: 1 } },
			)
			.toArray(),
	)
})
app.get('/api/search/date', async (req, res) => {
	const q = {}
	if (req.query.start || req.query.end) q.date = {}
	if (req.query.start) q.date.$gte = new Date(req.query.start)
	if (req.query.end) {
		const e = new Date(req.query.end)
		e.setHours(23, 59, 59)
		q.date.$lte = e
	}
	res.json(
		await db
			.collection('articles')
			.find(q, { projection: { _id: 1, title: 1, authors: 1, date: 1 } })
			.toArray(),
	)
})
app.get('/api/top', async (_, res) => {
	res.json(
		await db
			.collection('articles')
			.aggregate([
				{
					$addFields: {
						cnt: { $size: '$reviews' },
						avg: { $ifNull: [{ $avg: '$reviews.rating' }, 0] },
					},
				},
				{ $sort: { avg: -1, cnt: -1 } },
				{ $limit: 5 },
				{ $project: { _id: 1, title: 1, authors: 1, date: 1, cnt: 1 } },
			])
			.toArray(),
	)
})

app.post('/api/create', async (req, res) => {
	const { title, authors, date, content, tags } = req.body
	await db.collection('articles').insertOne({
		title,
		authors: authors
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean),
		date: new Date(date || Date.now()),
		content,
		tags: tags
			? tags
					.split(',')
					.map((s) => s.trim())
					.filter(Boolean)
			: [],
		reviews: [],
	})
	res.redirect('/')
})

app.post('/api/delete/:id', async (req, res) => {
	await db
		.collection('articles')
		.deleteOne({ _id: new ObjectId(req.params.id) })
	res.redirect('/')
})
