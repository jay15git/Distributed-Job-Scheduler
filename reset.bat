@echo off
set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/djs?schema=public
rmdir /s /q database\prisma\migrations
docker exec djs_postgres psql -U postgres -d djs -c "DROP SCHEMA public CASCADE;"
docker exec djs_postgres psql -U postgres -d djs -c "CREATE SCHEMA public;"
npx prisma@5.22.0 migrate dev --name init --schema=database/prisma/schema.prisma
