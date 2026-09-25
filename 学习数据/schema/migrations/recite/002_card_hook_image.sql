-- v1 → v2：背诵卡增加 记忆钩子 与 配图

ALTER TABLE recite_cards ADD COLUMN hook TEXT;
ALTER TABLE recite_cards ADD COLUMN image TEXT;
