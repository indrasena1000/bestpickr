require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const result = await mongoose.connection.db.collection('searchcaches').deleteMany({
    normalizedQuery: { $in: ['ovens', 'oven', 'microwave oven', 'best oven'] }
  });
  console.log('MongoDB SearchCache deleted:', result.deletedCount, 'stale entries');
  await mongoose.disconnect();
})().catch(e => { console.error(e.message); process.exit(1); });
