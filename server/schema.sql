CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(24) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS questions (
  id BIGSERIAL PRIMARY KEY,
  category VARCHAR(20) NOT NULL CHECK (category IN ('transfer','general')),
  difficulty VARCHAR(10) NOT NULL DEFAULT 'medium',
  question TEXT NOT NULL,
  options JSONB NOT NULL,
  correct_index INTEGER NOT NULL,
  explanation TEXT DEFAULT ''
);

INSERT INTO questions (category,difficulty,question,options,correct_index,explanation)
SELECT * FROM (VALUES
('general','easy','أي منتخب فاز بكأس العالم 2022؟','["الأرجنتين","فرنسا","البرازيل","ألمانيا"]'::jsonb,0,'فازت الأرجنتين بالنهائي.'),
('general','easy','كم لاعباً يبدأ به كل فريق مباراة كرة القدم؟','["9","10","11","12"]'::jsonb,2,'يبدأ كل فريق بـ11 لاعباً.'),
('general','medium','ما النادي الأكثر تتويجاً بدوري أبطال أوروبا؟','["برشلونة","ريال مدريد","ميلان","بايرن ميونخ"]'::jsonb,1,'ريال مدريد هو الأكثر تتويجاً.'),
('general','easy','كم مدة المباراة الأصلية دون الوقت بدل الضائع؟','["80 دقيقة","90 دقيقة","100 دقيقة","120 دقيقة"]'::jsonb,1,'شوطان، كل منهما 45 دقيقة.'),
('general','medium','في أي دولة أُقيم كأس العالم 2018؟','["روسيا","قطر","البرازيل","ألمانيا"]'::jsonb,0,'أُقيمت نسخة 2018 في روسيا.'),
('transfer','medium','انتقل كريستيانو رونالدو من مانشستر يونايتد إلى أي نادٍ في 2009؟','["ريال مدريد","يوفنتوس","النصر","سبورتينغ"]'::jsonb,0,'انتقل إلى ريال مدريد عام 2009.'),
('transfer','medium','من أي نادٍ انتقل لويس سواريز إلى برشلونة عام 2014؟','["ليفربول","أياكس","أتلتيكو مدريد","نابولي"]'::jsonb,0,'انتقل من ليفربول إلى برشلونة.'),
('transfer','medium','انتقل إيرلينغ هالاند إلى مانشستر سيتي قادماً من أي نادٍ؟','["بوروسيا دورتموند","لايبزيغ","سالزبورغ","مولده"]'::jsonb,0,'انضم من بوروسيا دورتموند عام 2022.'),
('transfer','medium','من أي نادٍ انتقل جود بيلينغهام إلى ريال مدريد؟','["بوروسيا دورتموند","تشيلسي","ليفربول","بايرن ميونخ"]'::jsonb,0,'انتقل من بوروسيا دورتموند عام 2023.'),
('transfer','easy','انتقل ليونيل ميسي من برشلونة إلى أي نادٍ في 2021؟','["باريس سان جيرمان","إنتر ميامي","مانشستر سيتي","يوفنتوس"]'::jsonb,0,'انضم إلى باريس سان جيرمان في 2021.')
) AS v(category,difficulty,question,options,correct_index,explanation)
WHERE NOT EXISTS (SELECT 1 FROM questions);
