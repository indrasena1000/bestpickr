// prisma/seed.js — Seeds initial categories into the database
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  const categories = [
    { slug: 'headphones',   name: 'Headphones',    emoji: '🎧' },
    { slug: 'smartphones',  name: 'Smartphones',   emoji: '📱' },
    { slug: 'laptops',      name: 'Laptops',       emoji: '💻' },
    { slug: 'appliances',   name: 'Appliances',    emoji: '🍳' },
    { slug: 'gaming',       name: 'Gaming',        emoji: '🎮' },
    { slug: 'footwear',     name: 'Footwear',      emoji: '👟' },
    { slug: 'skincare',     name: 'Skincare',      emoji: '✨' },
    { slug: 'fashion',      name: 'Fashion',       emoji: '👗' },
    { slug: 'books',        name: 'Books',         emoji: '📚' },
    { slug: 'cameras',      name: 'Cameras',       emoji: '📷' },
  ];

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: cat,
    });
    console.log(`  ✓ ${cat.emoji} ${cat.name}`);
  }

  console.log('✅ Seed complete!');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
