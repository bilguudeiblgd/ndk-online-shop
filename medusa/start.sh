#!/bin/sh

echo "Running database migrations..."
npx medusa db:migrate

echo "Seeding database..."
npm run seed || echo "Seeding failed or already seeded, continuing..."

echo "Starting Medusa development server..."
npm run dev
