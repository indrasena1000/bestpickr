"use strict";
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const byPlatformCat = await prisma.product.groupBy({
    by: ["platform", "category"],
    _count: { id: true },
  });
  console.log("Products by platform+category:");
  byPlatformCat.forEach((r) => {
    console.log(" ", r.platform, "|", r.category || "null", ":", r._count.id);
  });

  const fullData = await prisma.product.count({
    where: { inStock: true, aiScore: { not: null }, imageUrl: { not: null } },
  });
  console.log("\nProducts with inStock+aiScore+imageUrl:", fullData);

  const outOfStock = await prisma.product.count({ where: { inStock: false } });
  console.log("Products out-of-stock:", outOfStock);

  const noImage = await prisma.product.count({ where: { imageUrl: null } });
  console.log("Products with no image:", noImage);

  const noScore = await prisma.product.count({ where: { aiScore: null } });
  console.log("Products with no aiScore:", noScore);

  const total = await prisma.product.count();
  console.log("Total products:", total);

  // Show sample of fully-analyzed per category
  const cats = [
    "mobile",
    "laptop",
    "headphones",
    "televisions",
    "appliances",
    "gaming",
    "camera",
    "tablets",
    "smartwatch",
    "footwear",
    "skincare",
    "fashion",
  ];
  console.log("\nFully-analyzed products per category:");
  for (const cat of cats) {
    const c = await prisma.product.count({
      where: {
        category: cat,
        inStock: true,
        aiScore: { not: null },
        imageUrl: { not: null },
        brand: { not: null },
      },
    });
    console.log(" ", cat, ":", c);
  }
}

main()
  .catch((e) => console.error(e.message))
  .finally(() => prisma.$disconnect());
