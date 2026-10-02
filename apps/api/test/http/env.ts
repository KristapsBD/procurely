// Local defaults; real environment variables win (the compose db matches these).
process.env.DATABASE_URL ??=
  'postgresql://procurely_api:procurely_api@localhost:5433/procurely';
process.env.DIRECT_URL ??=
  'postgresql://procurely:procurely@localhost:5433/procurely';
process.env.NODE_ENV ??= 'test';
