const { MongoClient } = require('mongodb');
const uri = 'mongodb://127.0.0.1:27017';

async function seed() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('journal');
  const col = db.collection('articles');
  await col.deleteMany({}); // очистка для повторных запусков

  await col.insertMany([
    { title: 'ИИ в медицине', authors: ['Иванов И.И.', 'Петров П.П.'], date: new Date('2024-05-10'), content: 'Полный текст 1...', tags: ['ИИ', 'Медицина'], reviews: [{ name: 'Аноним', message: 'Полезно', rating: 8 }] },
    { title: 'Квантовые вычисления', authors: ['Сидоров С.С.'], date: new Date('2024-06-15'), content: 'Полный текст 2...', tags: ['Физика'], reviews: [] },
    { title: 'Оптимизация нейросетей', authors: ['Иванов И.И.', 'Козлов К.К.'], date: new Date('2024-07-20'), content: 'Полный текст 3...', tags: ['ИИ', 'Math'], reviews: [{ name: 'User', message: 'Отлично', rating: 10 }] },
    { title: 'Масштабирование БД', authors: ['Петров П.П.'], date: new Date('2024-08-01'), content: 'Полный текст 4...', tags: ['Backend'], reviews: [{ name: 'Dev', message: 'Норм', rating: 6 }] },
    { title: 'Веб-безопасность', authors: ['Новиков Н.Н.', 'Иванов И.И.'], date: new Date('2024-09-10'), content: 'Полный текст 5...', tags: ['Web'], reviews: [] }
  ]);
  console.log('✅ 5 статей добавлено.');
  await client.close();
}
seed().catch(console.error);