const express = require('express');
const router = express.Router();

// GET /api/news  - list top 5 published articles
router.get('/', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const articles = await prisma.newsArticle.findMany({
      where: { status: 'Published', visible: true },
      orderBy: [
        { trendScore: 'desc' },
        { relevance: 'desc' },
        { publishDate: 'desc' },
      ],
      take: 5,
      select: {
        slug: true,
        title: true,
        summary: true,
        imageUrl: true,
        source: true,
        sourceLink: true,
        publishDate: true,
        tags: true,
      },
    });
    res.json(articles);
  } catch (err) {
    next(err);
  }
});

// GET /api/news/:slug - article detail (only if Published + visible)
router.get('/:slug', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const prisma = req.app.locals.prisma;
    const article = await prisma.newsArticle.findUnique({
      where: { slug },
    });
    if (!article || article.status !== 'Published' || !article.visible) {
      return res.status(404).json({ error: 'Article not found' });
    }
    res.json(article);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
