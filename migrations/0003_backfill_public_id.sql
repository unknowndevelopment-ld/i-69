-- Give every existing user a public_id (for old accounts created before 0002)
-- SQLite evaluates randomblob() per row, so each row gets a unique value.
UPDATE users SET public_id = lower(hex(randomblob(10))) WHERE public_id IS NULL;
