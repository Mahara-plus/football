package com.footballchallenge.app;

import android.app.Activity;
import android.os.Bundle;
import android.graphics.Color;
import android.graphics.Typeface;
import android.view.Gravity;
import android.widget.*;
import org.json.*;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

public class MainActivity extends Activity {
    int bg=Color.rgb(7,17,31), panel=Color.rgb(17,32,51), green=Color.rgb(33,199,122);
    LinearLayout root, body;
    int rounds=5, totalPlayers=2, transitionCount=3, generalCount=2, playerCount=0, score=0, qIndex=0;
    String difficulty="متوسط", token="", serverUrl="http://10.0.2.2:3000";
    ArrayList<Question> quiz = new ArrayList<>();
    ExecutorService executor=Executors.newSingleThreadExecutor();

    static class Question {
        String category,q; String[] answers; int correct;
        Question(String c,String q,String[] a,int x){category=c;this.q=q;answers=a;correct=x;}
    }
    @Override public void onCreate(Bundle b){super.onCreate(b);showHome();}
    TextView text(String s,int size,int color){TextView t=new TextView(this);t.setText(s);t.setTextSize(size);t.setTextColor(color);t.setGravity(Gravity.CENTER);t.setPadding(12,12,12,12);return t;}
    void base(String title){
        root=new LinearLayout(this);root.setOrientation(1);root.setPadding(18,18,18,18);root.setBackgroundColor(bg);
        ScrollView sc=new ScrollView(this);body=new LinearLayout(this);body.setOrientation(1);body.setPadding(4,4,4,24);sc.addView(body);
        root.addView(sc,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);
        TextView h=text("⚽ "+title,25,Color.WHITE);h.setTypeface(null,Typeface.BOLD);body.addView(h);
    }
    void label(String s){body.addView(text(s,16,Color.LTGRAY));}
    EditText input(String hint,String value){EditText e=new EditText(this);e.setSingleLine(true);e.setText(value);e.setHint(hint);e.setTextColor(Color.WHITE);e.setHintTextColor(Color.GRAY);e.setPadding(16,8,16,8);e.setBackgroundColor(panel);LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.setMargins(4,8,4,8);body.addView(e,lp);return e;}
    Button button(String s,Runnable r){Button b=new Button(this);b.setText(s);b.setTextColor(Color.WHITE);b.setBackgroundTintList(android.content.res.ColorStateList.valueOf(green));LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.setMargins(4,7,4,7);body.addView(b,lp);b.setOnClickListener(v->r.run());return b;}
    void showHome(){
        base("تحدي كرة القدم");label(token.isEmpty()?"أهلاً بك! سجّل الدخول للميزات أونلاين، أو جرّب اللعب المحلي.":"تم تسجيل الدخول. يمكنك إنشاء غرفة أو دخول غرفة.");
        button("تسجيل الدخول / إنشاء حساب",()->showAuth());
        button("إعداد لعبة محلية",()->showSetup());
        button("إنشاء غرفة أونلاين",()->createRoom());
        button("الانضمام إلى غرفة",()->joinRoom());
        button("التصنيف العالمي",()->leaderboard());
        button("إعداد عنوان الخادم",()->serverSettings());
        button("عن النسخة",()->new android.app.AlertDialog.Builder(this).setTitle("ملاحظة").setMessage("هذه نسخة تأسيسية. يلزم نشر الخادم وربط عنوانه قبل استخدام اللعب عبر الإنترنت. دعم 100 ألف اتصال متزامن يتطلب بنية موزعة واختبارات تحميل فعلية.").setPositiveButton("حسناً",null).show());
    }
    void serverSettings(){base("عنوان الخادم");EditText e=input("https://your-api.example.com",serverUrl);button("حفظ",()->{serverUrl=e.getText().toString().trim().replaceAll("/+$","");showHome();});}
    void showAuth(){
        base("الحساب");EditText email=input("البريد الإلكتروني","");EditText pass=input("كلمة المرور","");EditText name=input("اسم المستخدم (للتسجيل فقط)","");
        button("تسجيل الدخول",()->authRequest("/api/auth/login",email.getText().toString(),pass.getText().toString(),null));
        button("إنشاء حساب",()->authRequest("/api/auth/register",email.getText().toString(),pass.getText().toString(),name.getText().toString()));
        button("رجوع",()->showHome());
    }
    void authRequest(String path,String email,String password,String username){
        try{
            JSONObject data=new JSONObject();data.put("email",email);data.put("password",password);if(username!=null)data.put("username",username);
            request("POST",path,data.toString(),false,result->{try{token=result.getString("token");runOnUiThread(()->{Toast.makeText(this,"تم تسجيل الدخول",Toast.LENGTH_SHORT).show();showHome();});}catch(Exception e){error("استجابة غير متوقعة");}});
        }catch(Exception e){error("تعذر تجهيز الطلب");}
    }
    interface Callback{void done(JSONObject result);}
    void request(String method,String path,String data,boolean requiresAuth,Callback cb){
        executor.execute(()->{
            HttpURLConnection c=null;
            try{
                URL u=new URL(serverUrl+path);c=(HttpURLConnection)u.openConnection();c.setRequestMethod(method);c.setConnectTimeout(10000);c.setReadTimeout(10000);c.setRequestProperty("Content-Type","application/json");
                if(requiresAuth)c.setRequestProperty("Authorization","Bearer "+token);
                if(data!=null){c.setDoOutput(true);c.getOutputStream().write(data.getBytes(StandardCharsets.UTF_8));}
                int code=c.getResponseCode();InputStream is=code<400?c.getInputStream():c.getErrorStream();
                ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] buf=new byte[2048];int n;while((n=is.read(buf))!=-1)out.write(buf,0,n);
                JSONObject result=new JSONObject(out.toString("UTF-8"));
                if(code>=400){String msg=result.optString("error","فشل الطلب");runOnUiThread(()->Toast.makeText(this,msg,Toast.LENGTH_LONG).show());}
                else if(cb!=null)cb.done(result);
            }catch(Exception e){runOnUiThread(()->Toast.makeText(this,"تعذر الاتصال بالخادم. تحقق من عنوانه والإنترنت.",Toast.LENGTH_LONG).show());}
            finally{if(c!=null)c.disconnect();}
        });
    }
    void createRoom(){
        if(token.isEmpty()){showAuth();return;}
        try{JSONObject d=new JSONObject();d.put("rounds",rounds);d.put("questionsPerRound",Math.max(1,transitionCount+generalCount+playerCount));
            request("POST","/api/rooms",d.toString(),true,r->{JSONObject room=r.optJSONObject("room");runOnUiThread(()->new android.app.AlertDialog.Builder(this).setTitle("تم إنشاء الغرفة").setMessage("رمز الغرفة: "+room.optString("code")+"\nأرسل الرمز لأصدقائك.").setPositiveButton("حسناً",null).show());});
        }catch(Exception e){error("تعذر إنشاء الغرفة");}
    }
    void joinRoom(){
        if(token.isEmpty()){showAuth();return;}base("الانضمام لغرفة");EditText code=input("رمز الغرفة","");button("انضمام",()->{try{JSONObject d=new JSONObject();d.put("code",code.getText().toString().trim());request("POST","/api/rooms/join",d.toString(),true,r->runOnUiThread(()->new android.app.AlertDialog.Builder(this).setTitle("انضممت للغرفة").setMessage("رمز الغرفة: "+code.getText()).setPositiveButton("حسناً",null).show()));}catch(Exception e){error("رمز غير صالح");}});}
    void leaderboard(){
        base("التصنيف العالمي");request("GET","/api/leaderboard",null,false,r->{JSONArray a=r.optJSONArray("leaderboard");StringBuilder s=new StringBuilder();if(a!=null)for(int i=0;i<a.length();i++){JSONObject x=a.optJSONObject(i);s.append(i+1).append(". ").append(x.optString("username")).append(" — ").append(x.optLong("points")).append(" نقطة\n");}runOnUiThread(()->label(s.length()==0?"لا توجد نتائج بعد":s.toString()));});
    }
    void showSetup(){
        base("إعداد المباراة");label("عدد الجولات");EditText r=input("1 إلى 100",""+rounds);
        label("عدد اللاعبين");EditText p=input("عدد اللاعبين",""+totalPlayers);
        label("أسئلة الانتقالات");EditText tr=input("عدد الأسئلة",""+transitionCount);
        label("الأسئلة العامة");EditText ge=input("عدد الأسئلة",""+generalCount);
        label("أسئلة تخمين اللاعبين");EditText pl=input("عدد الأسئلة",""+playerCount);
        Spinner sp=new Spinner(this);sp.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,new String[]{"سهل","متوسط","صعب"}));body.addView(sp);
        button("ابدأ",()->{try{rounds=clamp(Integer.parseInt(r.getText().toString()),1,100);totalPlayers=clamp(Integer.parseInt(p.getText().toString()),1,100000);transitionCount=clamp(Integer.parseInt(tr.getText().toString()),0,100);generalCount=clamp(Integer.parseInt(ge.getText().toString()),0,100);playerCount=clamp(Integer.parseInt(pl.getText().toString()),0,100);difficulty=sp.getSelectedItem().toString();if(transitionCount+generalCount+playerCount==0)throw new Exception();buildQuiz();score=0;qIndex=0;showQuestion();}catch(Exception e){error("أدخل أرقاماً صحيحة وأضف سؤالاً واحداً على الأقل.");}});
        button("رجوع",()->showHome());
    }
    int clamp(int x,int a,int b){return Math.max(a,Math.min(b,x));}
    void buildQuiz(){
        ArrayList<Question> t=new ArrayList<>(),g=new ArrayList<>(),p=new ArrayList<>();
        t.add(new Question("انتقالات","أي نادٍ انتقل إليه كريستيانو رونالدو من مانشستر يونايتد عام 2009؟",new String[]{"ريال مدريد","يوفنتوس","النصر","سبورتينغ"},0));
        t.add(new Question("انتقالات","من أي نادٍ انتقل لويس سواريز إلى برشلونة عام 2014؟",new String[]{"ليفربول","أياكس","أتلتيكو مدريد","بنفيكا"},0));
        t.add(new Question("انتقالات","إلى أي نادٍ انتقل إيرلينغ هالاند عام 2022؟",new String[]{"مانشستر سيتي","ريال مدريد","بايرن ميونخ","تشيلسي"},0));
        t.add(new Question("انتقالات","من أي نادٍ انتقل كيليان مبابي إلى ريال مدريد عام 2024؟",new String[]{"باريس سان جيرمان","موناكو","ليل","ليون"},0));
        g.add(new Question("معلومات عامة","كم لاعباً من كل فريق يكون داخل أرض الملعب عند بداية المباراة؟",new String[]{"11","10","9","12"},0));
        g.add(new Question("معلومات عامة","كم دقيقة هي مدة الوقت الأصلي للمباراة؟",new String[]{"90","80","100","60"},0));
        g.add(new Question("معلومات عامة","أي منتخب فاز بكأس العالم 2022؟",new String[]{"الأرجنتين","فرنسا","البرازيل","كرواتيا"},0));
        g.add(new Question("معلومات عامة","كل كم سنة تقام كأس العالم عادةً؟",new String[]{"4 سنوات","سنتان","3 سنوات","5 سنوات"},0));
        p.add(new Question("خمن اللاعب","أي لاعب يُلقب غالباً بالبرغوث؟",new String[]{"ليونيل ميسي","كريستيانو رونالدو","نيمار","لوكا مودريتش"},0));
        p.add(new Question("خمن اللاعب","أي لاعب برازيلي لعب لبرشلونة وباريس سان جيرمان؟",new String[]{"نيمار","كاكا","رونالدو نازاريو","ريفالدو"},0));
        quiz.clear();Random random=new Random();addRandom(t,transitionCount,random);addRandom(g,generalCount,random);addRandom(p,playerCount,random);Collections.shuffle(quiz,random);
        ArrayList<Question> all=new ArrayList<>();for(int i=0;i<rounds;i++)all.addAll(quiz);quiz=all;
    }
    void addRandom(ArrayList<Question> bank,int n,Random r){for(int i=0;i<n;i++)quiz.add(bank.get(r.nextInt(bank.size())));}
    void showQuestion(){
        if(qIndex>=quiz.size()){showResult();return;}Question q=quiz.get(qIndex);base("السؤال "+(qIndex+1)+" / "+quiz.size());
        TextView cat=text(q.category,16,green);body.addView(cat);TextView question=text(q.q,22,Color.WHITE);question.setTypeface(null,Typeface.BOLD);body.addView(question);
        for(int i=0;i<q.answers.length;i++){final int chosen=i;button(q.answers[i],()->{if(chosen==q.correct){score+=10;Toast.makeText(this,"صحيح +10",Toast.LENGTH_SHORT).show();}else Toast.makeText(this,"إجابة غير صحيحة",Toast.LENGTH_SHORT).show();qIndex++;showQuestion();});}
        button("إنهاء",()->showResult());
    }
    void showResult(){base("النتيجة");body.addView(text(score+" نقطة 🏆",28,green));if(!token.isEmpty()){button("إضافة النقاط للتصنيف العالمي",()->{try{JSONObject d=new JSONObject();d.put("points",score);request("POST","/api/score",d.toString(),true,r->runOnUiThread(()->Toast.makeText(this,"تم حفظ نقاطك",Toast.LENGTH_SHORT).show()));}catch(Exception e){error("تعذر الحفظ");}});}button("الرئيسية",()->showHome());}
    void error(String s){runOnUiThread(()->Toast.makeText(this,s,Toast.LENGTH_LONG).show());}
    @Override protected void onDestroy(){super.onDestroy();executor.shutdownNow();}
}
