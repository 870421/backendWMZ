function getHealth(_req, res) {
  res.json({
    status: 'ok',
    service: 'weathermapz-backend'
  });
}

module.exports = { getHealth };
