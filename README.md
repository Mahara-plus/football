# تحدي كرة القدم - مشروع APK

## خطوات الحصول على APK
1. أنشئ مستودعاً جديداً على GitHub، وارفع كل محتويات هذا المجلد (بما فيه مجلد .github).
2. ادخل تبويب Actions، واختر Build APK، ثم Run workflow (أو يعمل تلقائياً عند الرفع).
3. بعد دقائق افتح التشغيل المكتمل، ونزّل football-quiz-apk من قسم Artifacts. بداخله app-debug.apk.
4. انقله إلى هاتفك وثبّته (فعّل التثبيت من مصادر غير معروفة).

تعديل اللعبة: عدّل www/index.html ثم ارفعه، وسيُبنى APK جديد.

## تشغيل الأونلاين (سيرفر مجاني)
1. على render.com أنشئ New > Web Service من نفس المستودع، واجعل Root Directory = `server`.
2. Build Command: `npm install` و Start Command: `node server.js` (الخطة المجانية تكفي للتجربة، وأول اتصال قد يتأخر دقيقة).
3. سيعطيك رابطاً مثل `https://اسمك.onrender.com`. اكتبه في اللعبة بصيغة `wss://اسمك.onrender.com`.
4. المضيف يضغط "إنشاء غرفة" ويعطي الرمز للآخرين، وهم يدخلونه من "انضمام".
للتشغيل على جهازك: `cd server && npm install && node server.js` ثم `ws://عنوان-جهازك:8080` (يعمل في المتصفح فقط، أما APK فيحتاج wss).

\n## الشعار وتشغيل واجهة Render
- تم إضافة الشعار إلى `www/logo.png` ليظهر كأيقونة المتصفح، وإلى `assets/` لتوليد أيقونة تطبيق Android وشاشة البداية أثناء بناء APK.
- في Render استخدم Root Directory = `server`، وBuild Command = `npm install`، وStart Command = `node server.js`.
- رابط Render الرئيسي يعرض اللعبة الآن، بينما يبقى اتصال اللعب أونلاين عبر `wss://اسم-الخدمة.onrender.com`.
- فحص حالة السيرفر متاح عبر `/health`.
