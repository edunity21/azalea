/* ============================================================
   survey.js — 사전·사후 설문(효과성 검증) 화면과 통계
   ------------------------------------------------------------
   app.js 를 거의 고치지 않습니다. app.js 가 내어 준 창구(window.JD)만
   빌려 쓰고, 응답은 app.js 의 저장소(roster) 안에 함께 넣습니다.

     roster[학번].survey = {
       pre:  { at, k:{K01..}, a:{A01..}, p:{곡:{era,cue,why,rb}}, o:{} },
       post: { ... }
     }

   그래서 학생이 누르는 [제출 파일 만들기] 와 cloud.js 의 온라인 제출에
   설문 응답이 함께 실려 갑니다.
   ============================================================ */

(function () {
  "use strict";

  var byId = function (id) { return document.getElementById(id); };
  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var PHASES = { pre: "사전", post: "사후" };
  var CUE_MAX = 1, ERA_MAX = 1, RB_MAX = 3;      // 감상 역량 곡당 배점 (합 5점)

  /* JD 창구가 준비되기 전에는 아무것도 하지 않는다 */
  function jd() { return window.JD || null; }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function p2(n) { return (n < 10 ? "0" : "") + n; }
  function stamp() {
    var d = new Date();
    return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()) +
      " " + p2(d.getHours()) + ":" + p2(d.getMinutes());
  }
  function fstamp() {
    var d = new Date();
    return String(d.getFullYear()).slice(2) + p2(d.getMonth() + 1) + p2(d.getDate());
  }
  function toast(m, k) { if (jd() && jd().toast) jd().toast(m, k); }
  function trackOf(slug) {
    for (var i = 0; i < TRACKS.length; i++) if (TRACKS[i].slug === slug) return TRACKS[i];
    return null;
  }
  function indexOfSlug(slug) {
    for (var i = 0; i < TRACKS.length; i++) if (TRACKS[i].slug === slug) return i;
    return -1;
  }
  function eraName(id) {
    for (var i = 0; i < ERAS.length; i++) if (ERAS[i].id === id) return ERAS[i].name;
    return id;
  }
  function round1(x) { return Math.round(x * 10) / 10; }
  function round2(x) { return Math.round(x * 100) / 100; }
  function round3(x) { return Math.round(x * 1000) / 1000; }

  /* ============================================================
     저장소 — app.js 의 roster 안에 함께 둔다
     ============================================================ */
  var Data = {
    box: function (sid) {
      var J = jd(); if (!J) return null;
      var all = J.Roster.all();
      return all[sid] || null;
    },
    get: function (sid, phase) {
      var s = this.box(sid);
      return (s && s.survey && s.survey[phase]) ? s.survey[phase] : null;
    },
    put: function (sid, phase, rec) {
      var J = jd(); if (!J) return;
      var all = J.Roster.all();
      if (!all[sid]) { J.Roster.ensure(sid, (J.Auth.me && J.Auth.me.name) || ""); all = J.Roster.all(); }
      if (!all[sid].survey) all[sid].survey = {};
      all[sid].survey[phase] = rec;
      all[sid].updated = stamp();
      J.Roster.save(all);
    },
    list: function () {
      var J = jd(); if (!J) return [];
      return J.Roster.list().filter(function (s) { return s.survey && (s.survey.pre || s.survey.post); });
    }
  };

  /* 교사가 학생 제출 파일을 불러올 때 — 이미 매긴 루브릭 점수는 지키고 합친다 */
  window.SVMerge = function (target, incoming) {
    if (!incoming) return;
    target.survey = target.survey || {};
    ["pre", "post"].forEach(function (ph) {
      var inc = incoming[ph]; if (!inc) return;
      var old = target.survey[ph];
      if (old && old.p && inc.p) {
        Object.keys(inc.p).forEach(function (slug) {
          if (old.p[slug] && typeof old.p[slug].rb === "number" && typeof inc.p[slug].rb !== "number") {
            inc.p[slug].rb = old.p[slug].rb;         // 교사가 매긴 점수 보존
          }
        });
      }
      target.survey[ph] = inc;
    });
  };

  /* ============================================================
     채점
     ============================================================ */
  function knowScore(rec, phase) {
    var form = phase === "pre" ? "A" : "B";
    var per = {}, right = 0;
    SURVEY.know.forEach(function (it) {
      var v = rec && rec.k ? rec.k[it.id] : undefined;
      var ok = (typeof v === "number") && v === it[form].a;
      per[it.id] = (typeof v === "number") ? (ok ? 1 : 0) : null;
      if (ok) right++;
    });
    var answered = 0;
    SURVEY.know.forEach(function (it) { if (rec && rec.k && typeof rec.k[it.id] === "number") answered++; });
    return { right: right, n: SURVEY.know.length, answered: answered, per: per };
  }

  function affectScore(rec) {
    var vals = [], byF = {}, per = {};
    SURVEY.affect.factors.forEach(function (f) { byF[f.id] = []; });
    SURVEY.affect.items.forEach(function (it) {
      var raw = rec && rec.a ? rec.a[it.id] : undefined;
      if (typeof raw !== "number") { per[it.id] = null; return; }
      var v = it.rev ? (6 - raw) : raw;
      per[it.id] = v;
      vals.push(v);
      byF[it.f].push(v);
    });
    var out = { mean: vals.length ? avg(vals) : null, answered: vals.length, n: SURVEY.affect.items.length, per: per, f: {} };
    SURVEY.affect.factors.forEach(function (f) {
      out.f[f.id] = byF[f.id].length ? avg(byF[f.id]) : null;
    });
    return out;
  }

  function perfScore(rec, phase) {
    var set = SURVEY.perf.sets[phase], eraHit = 0, cueHit = 0, rb = 0, rbDone = 0, answered = 0;
    var per = [];
    set.forEach(function (s) {
      var t = trackOf(s.slug);
      var a = rec && rec.p ? rec.p[s.slug] : null;
      var eOk = !!(a && a.era && t && a.era === t.era);
      var cOk = !!(a && a.cue && s.cue.indexOf(a.cue) > -1);
      if (eOk) eraHit++;
      if (cOk) cueHit++;
      if (a && (a.era || a.cue || (a.why || "").trim())) answered++;
      if (a && typeof a.rb === "number") { rb += a.rb; rbDone++; }
      per.push({
        slug: s.slug, title: t ? t.title : s.slug, era: t ? t.era : "",
        ans: a || {}, eraOk: eOk, cueOk: cOk, rb: (a && typeof a.rb === "number") ? a.rb : null
      });
    });
    return {
      eraHit: eraHit, cueHit: cueHit, rb: rb, rbDone: rbDone, tracks: set.length,
      answered: answered, per: per,
      objective: eraHit * ERA_MAX + cueHit * CUE_MAX,               // 자동 채점분 (곡당 2점)
      objMax: set.length * (ERA_MAX + CUE_MAX),
      total: (rbDone === set.length) ? (eraHit + cueHit + rb) : null, // 루브릭까지 끝났을 때만
      totalMax: set.length * (ERA_MAX + CUE_MAX + RB_MAX)
    };
  }

  function isDone(rec, phase) {
    if (!rec) return false;
    var k = knowScore(rec, phase), a = affectScore(rec), p = perfScore(rec, phase);
    return k.answered === k.n && a.answered === a.n && p.answered === p.tracks;
  }
  function progress(rec, phase) {
    if (!rec) return { done: 0, all: SURVEY.know.length + SURVEY.affect.items.length + SURVEY.perf.sets[phase].length };
    var k = knowScore(rec, phase), a = affectScore(rec), p = perfScore(rec, phase);
    return { done: k.answered + a.answered + p.answered, all: k.n + a.n + p.tracks };
  }

  /* ============================================================
     통계 — 대응표본 t검정 · Cohen's d · Cronbach's α
     ============================================================ */
  function avg(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s / a.length; }
  function sdev(a) {                                  // 표본표준편차 (n−1)
    if (a.length < 2) return 0;
    var m = avg(a), s = 0;
    for (var i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m);
    return Math.sqrt(s / (a.length - 1));
  }
  function variance(a) { var s = sdev(a); return s * s; }

  function gammln(x) {
    var c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
             -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    var y = x, tmp = x + 5.5, ser = 1.000000000190015;
    tmp -= (x + 0.5) * Math.log(tmp);
    for (var j = 0; j < 6; j++) { y += 1; ser += c[j] / y; }
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }
  function betacf(a, b, x) {
    var MAXIT = 200, EPS = 3e-12, FPMIN = 1e-300;
    var qab = a + b, qap = a + 1, qam = a - 1;
    var c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    var h = d, m, m2, aa, del;
    for (m = 1; m <= MAXIT; m++) {
      m2 = 2 * m;
      aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c;  if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c;  if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; del = d * c; h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }
  function betai(a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    var bt = Math.exp(gammln(a + b) - gammln(a) - gammln(b) + a * Math.log(x) + b * Math.log(1 - x));
    if (x < (a + 1) / (a + b + 2)) return bt * betacf(a, b, x) / a;
    return 1 - bt * betacf(b, a, 1 - x) / b;
  }
  /* 양쪽꼬리 p값 */
  function tP(t, df) {
    if (!isFinite(t) || df <= 0) return null;
    return betai(df / 2, 0.5, df / (df + t * t));
  }

  /* 대응표본 t검정 */
  function pairedT(pre, post) {
    var n = pre.length;
    if (n < 2) return null;
    var diff = [];
    for (var i = 0; i < n; i++) diff.push(post[i] - pre[i]);
    var md = avg(diff), sdd = sdev(diff);
    if (sdd === 0) {
      return { n: n, mPre: avg(pre), sdPre: sdev(pre), mPost: avg(post), sdPost: sdev(post),
               md: md, sdd: 0, t: null, df: n - 1, p: null, d: null };
    }
    var t = md / (sdd / Math.sqrt(n));
    return {
      n: n, mPre: avg(pre), sdPre: sdev(pre), mPost: avg(post), sdPost: sdev(post),
      md: md, sdd: sdd, t: t, df: n - 1, p: tP(t, n - 1), d: md / sdd
    };
  }

  /* Cronbach's α — rows = 사람, cols = 문항 */
  function alpha(rows) {
    if (!rows.length) return null;
    var k = rows[0].length;
    if (k < 2 || rows.length < 2) return null;
    var sumItemVar = 0;
    for (var j = 0; j < k; j++) {
      var col = rows.map(function (r) { return r[j]; });
      sumItemVar += variance(col);
    }
    var totals = rows.map(function (r) { var s = 0; for (var i = 0; i < r.length; i++) s += r[i]; return s; });
    var vt = variance(totals);
    if (vt === 0) return null;
    return (k / (k - 1)) * (1 - sumItemVar / vt);
  }

  function pTxt(p) {
    if (p == null) return "–";
    if (p < 0.001) return "<.001 ***";
    if (p < 0.01)  return p.toFixed(3) + " **";
    if (p < 0.05)  return p.toFixed(3) + " *";
    return p.toFixed(3);
  }
  function dTxt(d) {
    if (d == null) return "–";
    var a = Math.abs(d), s = a >= 0.8 ? "큼" : a >= 0.5 ? "중간" : a >= 0.2 ? "작음" : "미미";
    return d.toFixed(2) + " (" + s + ")";
  }
  function num(x, dg) { return x == null ? "–" : x.toFixed(dg == null ? 2 : dg); }

  /* ============================================================
     학습자용 — 설문 작성 화면
     ============================================================ */
  var Sv = {
    phase: "pre",
    timer: null,

    start: function () {
      byId("svPre").addEventListener("click", function () { Sv.setPhase("pre"); });
      byId("svPost").addEventListener("click", function () { Sv.setPhase("post"); });
      byId("svSave").addEventListener("click", function () { Sv.save(true); });
      byId("svFile").addEventListener("click", function () { Sv.file(); });
      byId("svBody").addEventListener("change", function (e) { Sv.onEdit(e); });
      byId("svBody").addEventListener("input", function (e) {
        if (e.target && e.target.tagName === "TEXTAREA") Sv.queue();
      });
      byId("svBody").addEventListener("click", function (e) {
        var b = e.target.closest ? e.target.closest("[data-play]") : null;
        if (!b) return;
        var i = indexOfSlug(b.getAttribute("data-play"));
        if (i > -1 && jd() && jd().playBlind) jd().playBlind(i);
      });
    },

    /* 로그인 직후 호출 */
    open: function () {
      var sid = jd() && jd().Auth.me ? jd().Auth.me.sid : "";
      var pre = sid ? Data.get(sid, "pre") : null;
      this.phase = (pre && isDone(pre, "pre")) ? "post" : "pre";
      this.render();
    },

    setPhase: function (ph) {
      this.save(false);
      this.phase = ph;
      this.render();
    },

    me: function () { return (jd() && jd().Auth.me) ? jd().Auth.me : null; },
    rec: function () {
      var m = this.me(); if (!m || !m.sid) return {};
      return Data.get(m.sid, this.phase) || {};
    },

    render: function () {
      var m = this.me();
      if (!m || m.role !== "student") return;
      var ph = this.phase, rec = this.rec();

      /* 머리 — 단계 단추 */
      byId("svPre").classList.toggle("on", ph === "pre");
      byId("svPost").classList.toggle("on", ph === "post");
      ["pre", "post"].forEach(function (k) {
        var r = Data.get(m.sid, k), pg = progress(r, k);
        var el = byId(k === "pre" ? "svPreNote" : "svPostNote");
        el.textContent = !r ? "아직 시작하지 않음"
          : (isDone(r, k) ? "작성 완료 · " + (r.at || "") : "작성 중 · " + pg.done + "/" + pg.all);
      });

      var guide = ph === "pre"
        ? "수업을 시작하기 <b>전에</b> 답하는 설문입니다. 아직 배우지 않은 내용이 나오는 것이 정상입니다. " +
          "모르는 문항도 <b>가장 그럴듯한 것을 골라</b> 빈칸 없이 채워 주세요. 점수는 성적에 들어가지 않습니다.<br>" +
          "<b>사전 설문을 마칠 때까지 다른 탭(시대 탐구·듣고 맞히기 등)은 열지 마세요.</b>"
        : "수업을 <b>마친 뒤</b> 답하는 설문입니다. 문항 수와 방식은 사전 설문과 같고, 지식 문항과 감상 곡만 다른 것으로 바뀝니다. " +
          "사전에 무엇이라고 답했는지는 신경 쓰지 말고 지금 생각대로 답해 주세요.";
      byId("svGuide").innerHTML = guide;

      /* 본문 */
      var h = "";

      /* 1부 지식 */
      var form = ph === "pre" ? "A" : "B";
      h += '<div class="card sv-part"><div class="sv-part-h"><span class="sv-badge">1부</span>' +
        "<h3>음악사 지식 <small>15문항 · 하나만 고르기</small></h3></div>" +
        '<p class="cap">들어 본 적 없는 말이 나와도 괜찮습니다. 가장 그럴듯한 것을 고르세요.</p>';
      SURVEY.know.forEach(function (it, n) {
        var q = it[form], cur = rec.k ? rec.k[it.id] : undefined;
        h += '<div class="sv-q" id="q_' + it.id + '"><p class="sv-qt"><b>' + (n + 1) + ".</b> " + esc(q.q) + "</p>" +
          '<div class="axis-opts sv-choice">' +
          q.o.map(function (o, k) {
            var id = "k_" + it.id + "_" + k;
            return '<input type="radio" name="k_' + it.id + '" id="' + id + '" data-k="' + it.id + '" value="' + k + '"' +
              (cur === k ? " checked" : "") + '><label for="' + id + '"><span class="sv-num">' + (k + 1) + "</span>" + esc(o) + "</label>";
          }).join("") + "</div></div>";
      });
      h += "</div>";

      /* 2부 정의적 */
      h += '<div class="card sv-part"><div class="sv-part-h"><span class="sv-badge">2부</span>' +
        "<h3>음악 감상에 대한 생각 <small>16문항 · 5점 척도</small></h3></div>" +
        '<p class="cap">정답이 없는 문항입니다. 지금 자기 생각과 가장 가까운 곳을 고르세요.</p>' +
        '<div class="sv-scalekey">' + SURVEY.affect.scale.map(function (s, i) {
          return "<span><b>" + (i + 1) + "</b> " + esc(s) + "</span>";
        }).join("") + "</div>";
      SURVEY.affect.items.forEach(function (it, n) {
        var cur = rec.a ? rec.a[it.id] : undefined;
        /* 역문항 표시는 학생에게 보여 주지 않는다 (응답 편향을 막기 위해) */
        h += '<div class="sv-q lk" id="q_' + it.id + '"><p class="sv-qt"><b>' + (n + 1) + ".</b> " + esc(it.t) + "</p>" +
          '<div class="axis-opts sv-lk">' +
          SURVEY.affect.scale.map(function (s, k) {
            var v = k + 1, id = "a_" + it.id + "_" + v;
            return '<input type="radio" name="a_' + it.id + '" id="' + id + '" data-a="' + it.id + '" value="' + v + '"' +
              (cur === v ? " checked" : "") + '><label for="' + id + '" title="' + esc(s) + '"><span class="sv-num">' + v + "</span></label>";
          }).join("") + "</div></div>";
      });
      h += "</div>";

      /* 3부 감상 역량 */
      h += '<div class="card sv-part"><div class="sv-part-h"><span class="sv-badge">3부</span>' +
        "<h3>듣고 판단하기 <small>" + SURVEY.perf.sets[ph].length + "곡 · 제목을 가린 감상</small></h3></div>" +
        '<p class="cap">제목을 가린 채로 음악이 재생됩니다. 30초 이상 들은 뒤 답하세요. 이어폰을 쓰면 좋습니다.</p>';
      SURVEY.perf.sets[ph].forEach(function (s, n) {
        var a = (rec.p && rec.p[s.slug]) ? rec.p[s.slug] : {};
        h += '<div class="sv-perf" id="q_p_' + s.slug + '">' +
          '<div class="sv-perf-h"><span class="sv-perf-n">감상 ' + (n + 1) + '</span>' +
          '<button class="btn small" type="button" data-play="' + s.slug + '">듣기 / 멈추기</button></div>' +

          '<div class="axis"><label>① 어느 시대의 음악이라고 생각하나요?</label><div class="axis-opts">' +
          ERAS.map(function (e) {
            var id = "pe_" + s.slug + "_" + e.id;
            return '<input type="radio" name="pe_' + s.slug + '" id="' + id + '" data-pe="' + s.slug + '" value="' + e.id + '"' +
              (a.era === e.id ? " checked" : "") + '><label for="' + id + '">' + esc(e.name) + "</label>";
          }).join("") + "</div></div>" +

          '<div class="axis"><label>② 그렇게 판단한 가장 결정적인 근거는 무엇인가요?</label><div class="axis-opts">' +
          SURVEY.perf.cues.map(function (c, k) {
            var id = "pc_" + s.slug + "_" + k;
            return '<input type="radio" name="pc_' + s.slug + '" id="' + id + '" data-pc="' + s.slug + '" value="' + esc(c) + '"' +
              (a.cue === c ? " checked" : "") + '><label for="' + id + '">' + esc(c) + "</label>";
          }).join("") + "</div></div>" +

          '<div class="axis"><label>③ 그 근거를 음악 요소를 들어 한두 문장으로 쓰세요</label>' +
          '<textarea class="free" data-pw="' + s.slug + '" maxlength="300" ' +
          'placeholder="예) 반주가 없고 두 사람의 선율이 나란히 움직여서 아주 오래된 음악처럼 들렸다.">' +
          esc(a.why || "") + "</textarea></div></div>";
      });
      h += "</div>";

      /* 4부 개방형 — 사후에만 */
      if (ph === "post") {
        h += '<div class="card sv-part"><div class="sv-part-h"><span class="sv-badge">4부</span>' +
          "<h3>수업을 마치고 <small>2문항 · 서술</small></h3></div>";
        SURVEY.open.forEach(function (o) {
          var v = rec.o ? (rec.o[o.id] || "") : "";
          h += '<div class="axis"><label>' + esc(o.t) + "</label>" +
            '<textarea class="free" data-o="' + o.id + '" maxlength="500">' + esc(v) + "</textarea></div>";
        });
        h += "</div>";
      }

      byId("svBody").innerHTML = h;
      this.paintFoot();
    },

    paintFoot: function () {
      var m = this.me(); if (!m) return;
      var rec = this.rec(), pg = progress(rec, this.phase);
      byId("svCount").textContent = pg.done + " / " + pg.all + " 문항 응답";
      byId("svBar").style.width = (pg.all ? (pg.done / pg.all * 100) : 0) + "%";
      var note = byId("svSaved");
      note.textContent = rec.at ? "저장됨 · " + rec.at : "아직 저장하지 않았습니다";
      note.className = "saved-note" + (rec.at ? " ok" : "");
      byId("svPhaseNow").textContent = PHASES[this.phase] + " 설문";
    },

    onEdit: function (e) {
      var t = e.target; if (!t) return;
      if (t.dataset.k || t.dataset.a || t.dataset.pe || t.dataset.pc) this.queue();
    },

    queue: function () {
      clearTimeout(this.timer);
      this.timer = setTimeout(function () { Sv.save(false); }, 900);
    },

    collect: function () {
      var rec = { at: stamp(), k: {}, a: {}, p: {}, o: {} };
      var old = this.rec();
      $$('#svBody input[data-k]:checked').forEach(function (el) { rec.k[el.dataset.k] = +el.value; });
      $$('#svBody input[data-a]:checked').forEach(function (el) { rec.a[el.dataset.a] = +el.value; });
      SURVEY.perf.sets[this.phase].forEach(function (s) {
        var e = $('#svBody input[data-pe="' + s.slug + '"]:checked');
        var c = $('#svBody input[data-pc="' + s.slug + '"]:checked');
        var w = $('#svBody textarea[data-pw="' + s.slug + '"]');
        var one = {};
        if (e) one.era = e.value;
        if (c) one.cue = c.value;
        if (w && w.value.trim()) one.why = w.value.trim();
        /* 교사가 매긴 루브릭 점수는 유지 */
        if (old.p && old.p[s.slug] && typeof old.p[s.slug].rb === "number") one.rb = old.p[s.slug].rb;
        if (Object.keys(one).length) rec.p[s.slug] = one;
      });
      $$("#svBody textarea[data-o]").forEach(function (el) {
        if (el.value.trim()) rec.o[el.dataset.o] = el.value.trim();
      });
      return rec;
    },

    save: function (loud) {
      var m = this.me();
      if (!m || !m.sid || !byId("svBody").innerHTML) return;
      var rec = this.collect(), pg = progress(rec, this.phase);
      if (!pg.done) { if (loud) toast("아직 고르거나 적은 내용이 없습니다.", "bad"); return; }
      Data.put(m.sid, this.phase, rec);
      this.paintFoot();
      ["pre", "post"].forEach(function (k) {
        var r = Data.get(m.sid, k), p = progress(r, k);
        byId(k === "pre" ? "svPreNote" : "svPostNote").textContent =
          !r ? "아직 시작하지 않음" : (isDone(r, k) ? "작성 완료 · " + (r.at || "") : "작성 중 · " + p.done + "/" + p.all);
      });
      if (loud) {
        if (pg.done < pg.all) {
          var miss = this.firstMissing(rec);
          toast("저장했습니다. 아직 " + (pg.all - pg.done) + "문항이 비어 있습니다.", "bad");
          if (miss) {
            var el = byId(miss);
            if (el) { el.classList.add("miss"); el.scrollIntoView({ block: "center" }); setTimeout(function () { el.classList.remove("miss"); }, 2600); }
          }
        } else {
          toast(PHASES[this.phase] + " 설문을 모두 작성했습니다. 고맙습니다.");
        }
      }
    },

    firstMissing: function (rec) {
      var hit = null;
      SURVEY.know.forEach(function (it) { if (!hit && typeof rec.k[it.id] !== "number") hit = "q_" + it.id; });
      if (hit) return hit;
      SURVEY.affect.items.forEach(function (it) { if (!hit && typeof rec.a[it.id] !== "number") hit = "q_" + it.id; });
      if (hit) return hit;
      SURVEY.perf.sets[this.phase].forEach(function (s) {
        if (!hit && !rec.p[s.slug]) hit = "q_p_" + s.slug;
      });
      return hit;
    },

    file: function () {
      var m = this.me(); if (!m || !m.sid) return;
      this.save(false);
      var s = Data.box(m.sid);
      if (!s || !s.survey) { toast("저장된 응답이 없습니다.", "bad"); return; }
      var J = jd();
      J.saveBlob("설문_" + m.sid + "_" + m.name + "_" + fstamp() + ".json",
        JSON.stringify({ app: "jindalrae", ver: 3, kind: "survey", exported: stamp(),
          sid: s.sid, name: s.name, tracks: s.tracks || {}, survey: s.survey }, null, 1),
        "application/json");
      toast("설문 제출 파일을 만들었습니다. 선생님께 전달하세요.");
    }
  };

  /* ============================================================
     수업자용 — 결과 집계
     ============================================================ */
  var Adm = {
    view: "sum",

    start: function () {
      byId("svView").addEventListener("change", function () { Adm.view = this.value; Adm.paint(); });
      byId("svXls").addEventListener("click", function () { Adm.xls(); });
      byId("svPrint").addEventListener("click", function () { Adm.print(); });
      byId("svImport").addEventListener("change", function (e) { Adm.imp(e.target.files); });
      byId("svBody2").addEventListener("change", function (e) {
        var t = e.target;
        if (t && t.dataset.rb) Adm.setRb(t.dataset.sid, t.dataset.phase, t.dataset.slug, +t.value);
      });
    },

    render: function () { this.paint(); },

    /* 분석 대상 — 사전·사후 모두 응답한 학생(대응표본) */
    rows: function () {
      return Data.list().map(function (s) {
        var pre = s.survey.pre || null, post = s.survey.post || null;
        return {
          sid: s.sid, name: s.name, pre: pre, post: post,
          kPre: pre ? knowScore(pre, "pre") : null,
          kPost: post ? knowScore(post, "post") : null,
          aPre: pre ? affectScore(pre) : null,
          aPost: post ? affectScore(post) : null,
          pPre: pre ? perfScore(pre, "pre") : null,
          pPost: post ? perfScore(post, "post") : null
        };
      }).sort(function (a, b) { return a.sid < b.sid ? -1 : 1; });
    },

    /* 영역별 대응표본 결과 */
    stats: function (rows) {
      var both = rows.filter(function (r) { return r.pre && r.post; });
      var out = [];

      function push(label, unit, getPre, getPost) {
        var xs = [], ys = [];
        both.forEach(function (r) {
          var a = getPre(r), b = getPost(r);
          if (a == null || b == null) return;
          xs.push(a); ys.push(b);
        });
        out.push({ label: label, unit: unit, r: pairedT(xs, ys), n: xs.length });
      }

      push("음악사 지식 (15점)", "점", function (r) { return r.kPre.right; }, function (r) { return r.kPost.right; });
      push("정의적 영역 전체 (5점)", "점", function (r) { return r.aPre.mean; }, function (r) { return r.aPost.mean; });
      SURVEY.affect.factors.forEach(function (f) {
        push("　· " + f.name + " (5점)", "점",
          function (r) { return r.aPre.f[f.id]; }, function (r) { return r.aPost.f[f.id]; });
      });
      push("감상 역량 — 자동 채점 (6점)", "점",
        function (r) { return r.pPre.objective; }, function (r) { return r.pPost.objective; });
      push("　· 시대 추론 정답 수 (3문항)", "개",
        function (r) { return r.pPre.eraHit; }, function (r) { return r.pPost.eraHit; });
      push("감상 역량 — 서술 포함 (15점)", "점",
        function (r) { return r.pPre.total; }, function (r) { return r.pPost.total; });
      return out;
    },

    alphas: function (rows) {
      function mat(phase) {
        var m = [];
        rows.forEach(function (r) {
          var rec = r[phase]; if (!rec) return;
          var vals = [], ok = true;
          SURVEY.affect.items.forEach(function (it) {
            var raw = rec.a ? rec.a[it.id] : undefined;
            if (typeof raw !== "number") { ok = false; return; }
            vals.push(it.rev ? 6 - raw : raw);
          });
          if (ok) m.push(vals);
        });
        return m;
      }
      return { pre: alpha(mat("pre")), post: alpha(mat("post")) };
    },

    paint: function () {
      var rows = this.rows();
      var nPre = rows.filter(function (r) { return r.pre; }).length;
      var nPost = rows.filter(function (r) { return r.post; }).length;
      var both = rows.filter(function (r) { return r.pre && r.post; }).length;
      byId("svN1").textContent = nPre;
      byId("svN2").textContent = nPost;
      byId("svN3").textContent = both;

      if (!rows.length) {
        byId("svBody2").innerHTML = '<p class="empty">아직 모인 설문 응답이 없습니다.<br>' +
          "학생이 <b>같은 기기</b>에서 작성했다면 자동으로 나타납니다. 학생이 <b>자기 기기</b>에서 작성했다면 " +
          "[설문 파일 불러오기]로 <b>설문_학번_이름.json</b> 또는 <b>제출_학번_이름.json</b> 파일을 한꺼번에 선택하세요.</p>";
        return;
      }
      if (this.view === "sum") this.paintSum(rows);
      else if (this.view === "stu") this.paintStu(rows);
      else if (this.view === "rb") this.paintRb(rows);
      else this.paintItem(rows);
    },

    paintSum: function (rows) {
      var st = this.stats(rows), al = this.alphas(rows);
      var both = rows.filter(function (r) { return r.pre && r.post; }).length;

      var h = '<p class="cap">단일집단 사전-사후 설계 · 대응표본 t검정. ' +
        "사전과 사후를 <b>모두</b> 작성한 " + both + "명만 검정에 들어갑니다. " +
        "<span class='mono'>* p&lt;.05　** p&lt;.01　*** p&lt;.001</span></p>";

      h += '<div class="tw"><table class="grid"><thead><tr><th>영역</th><th>n</th>' +
        "<th>사전 M</th><th>사전 SD</th><th>사후 M</th><th>사후 SD</th><th>평균차</th>" +
        "<th>t</th><th>df</th><th>p</th><th>Cohen's d</th></tr></thead><tbody>";
      st.forEach(function (s) {
        var r = s.r;
        if (!r) {
          h += "<tr><td>" + esc(s.label) + '</td><td class="mono">' + s.n +
            '</td><td colspan="9" class="sm">대응 인원이 2명 미만이라 계산할 수 없습니다.</td></tr>';
          return;
        }
        var up = r.md > 0;
        h += "<tr><td>" + esc(s.label) + '</td><td class="mono">' + r.n + "</td>" +
          '<td class="mono">' + num(r.mPre) + '</td><td class="mono">' + num(r.sdPre) + "</td>" +
          '<td class="mono">' + num(r.mPost) + '</td><td class="mono">' + num(r.sdPost) + "</td>" +
          '<td class="mono ' + (up ? "up" : "dn") + '">' + (up ? "+" : "") + num(r.md) + "</td>" +
          '<td class="mono">' + (r.t == null ? "–" : r.t.toFixed(2)) + '</td><td class="mono">' + r.df + "</td>" +
          '<td class="mono">' + pTxt(r.p) + '</td><td class="mono">' + dTxt(r.d) + "</td></tr>";
      });
      h += "</tbody></table></div>";

      h += '<div class="statblk" style="margin-top:24px"><h4>척도 신뢰도 <small>정의적 영역 16문항 · Cronbach α</small></h4>' +
        '<div class="statrow"><span class="k">사전</span><span class="v"><span class="tag">α ' +
        (al.pre == null ? "–" : al.pre.toFixed(3)) + "</span></span></div>" +
        '<div class="statrow"><span class="k">사후</span><span class="v"><span class="tag">α ' +
        (al.post == null ? "–" : al.post.toFixed(3)) + "</span></span></div>" +
        '<p class="cap">.70 이상이면 보고서에 쓸 만한 내적 일관성으로 봅니다. 역문항(A04·A08)은 역채점한 뒤 계산했습니다.</p></div>';

      var need = rows.filter(function (r) {
        return (r.pPre && r.pPre.rbDone < r.pPre.tracks) || (r.pPost && r.pPost.rbDone < r.pPost.tracks);
      }).length;
      if (need) {
        h += '<div class="verdict no" style="margin-top:20px"><b>서술형 채점이 남아 있습니다 — ' + need + "명</b>" +
          "<span class='cl'>3부 ③번 서술은 사람이 읽고 매겨야 합니다. 위 [보기]를 <b>서술형 채점</b>으로 바꿔 " +
          "0~3점을 매기면 ‘감상 역량 — 서술 포함(15점)’ 줄이 채워집니다.</span></div>";
      }
      byId("svBody2").innerHTML = h;
    },

    paintStu: function (rows) {
      var h = '<p class="cap">학생별 점수입니다. 향상 칸의 <b class="up">＋</b>는 사후가 올라간 경우입니다.</p>' +
        '<div class="tw"><table class="grid"><thead><tr><th>학번</th><th>이름</th>' +
        "<th>지식 사전</th><th>지식 사후</th><th>향상</th>" +
        "<th>정의적 사전</th><th>정의적 사후</th><th>향상</th>" +
        "<th>감상(자동) 사전</th><th>감상(자동) 사후</th><th>향상</th><th>서술채점</th></tr></thead><tbody>";
      rows.forEach(function (r) {
        function cell(v, dg) { return '<td class="mono">' + (v == null ? "–" : (dg ? v.toFixed(dg) : v)) + "</td>"; }
        function gap(a, b, dg) {
          if (a == null || b == null) return '<td class="mono">–</td>';
          var d = b - a;
          return '<td class="mono ' + (d > 0 ? "up" : d < 0 ? "dn" : "") + '">' +
            (d > 0 ? "+" : "") + (dg ? d.toFixed(dg) : d) + "</td>";
        }
        var rbAll = (r.pPre ? r.pPre.rbDone : 0) + (r.pPost ? r.pPost.rbDone : 0);
        var rbNeed = (r.pPre ? r.pPre.tracks : 0) + (r.pPost ? r.pPost.tracks : 0);
        h += '<tr><td class="mono">' + esc(r.sid) + "</td><td><b>" + esc(r.name) + "</b></td>" +
          cell(r.kPre ? r.kPre.right : null) + cell(r.kPost ? r.kPost.right : null) +
          gap(r.kPre ? r.kPre.right : null, r.kPost ? r.kPost.right : null) +
          cell(r.aPre ? r.aPre.mean : null, 2) + cell(r.aPost ? r.aPost.mean : null, 2) +
          gap(r.aPre ? r.aPre.mean : null, r.aPost ? r.aPost.mean : null, 2) +
          cell(r.pPre ? r.pPre.objective : null) + cell(r.pPost ? r.pPost.objective : null) +
          gap(r.pPre ? r.pPre.objective : null, r.pPost ? r.pPost.objective : null) +
          '<td class="mono sm">' + rbAll + " / " + rbNeed + "</td></tr>";
      });
      byId("svBody2").innerHTML = h + "</tbody></table></div>";
    },

    paintRb: function (rows) {
      var h = '<p class="cap">3부 ③번 서술 응답입니다. 아래 기준으로 <b>0~3점</b>을 매기세요. 고른 즉시 저장됩니다.</p>' +
        '<div class="blk" style="margin-bottom:22px"><ul>' +
        SURVEY.perf.rubric.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div>";
      var any = false;
      rows.forEach(function (r) {
        ["pre", "post"].forEach(function (ph) {
          var rec = r[ph]; if (!rec) return;
          var sc = ph === "pre" ? r.pPre : r.pPost;
          sc.per.forEach(function (one) {
            any = true;
            var t = trackOf(one.slug);
            h += '<div class="ans"><b>' + esc(r.sid) + " " + esc(r.name) + " · " + PHASES[ph] +
              ' <span class="sv-tk">' + esc(t ? p2(t.n) + ". " + t.title : one.slug) + "</span></b>" +
              '<div class="tags"><span class="tag">시대 응답 · ' + esc(one.ans.era ? eraName(one.ans.era) : "–") +
              (one.eraOk ? " ✓" : "") + '</span><span class="tag">근거 요소 · ' + esc(one.ans.cue || "–") +
              (one.cueOk ? " ✓" : "") + "</span></div>" +
              '<p><span class="lb">서술</span> ' + esc(one.ans.why || "(응답 없음)") + "</p>" +
              '<div class="axis-opts sv-rb">' + [0, 1, 2, 3].map(function (v) {
                var id = "rb_" + r.sid + "_" + ph + "_" + one.slug + "_" + v;
                return '<input type="radio" name="rb_' + r.sid + "_" + ph + "_" + one.slug + '" id="' + id + '"' +
                  ' data-rb="1" data-sid="' + esc(r.sid) + '" data-phase="' + ph + '" data-slug="' + esc(one.slug) + '"' +
                  ' value="' + v + '"' + (one.rb === v ? " checked" : "") + '><label for="' + id + '">' + v + "점</label>";
              }).join("") + "</div></div>";
          });
        });
      });
      byId("svBody2").innerHTML = any ? h : h + '<p class="empty">채점할 서술 응답이 없습니다.</p>';
    },

    paintItem: function (rows) {
      var form, h = '<p class="cap">문항별 응답 분석입니다. 사전보다 사후가 낮아진 문항은 수업에서 덜 다뤄진 내용일 수 있습니다.</p>';

      h += '<div class="statblk"><h4>1부 음악사 지식 <small>문항별 정답률</small></h4>' +
        '<div class="tw"><table class="grid"><thead><tr><th>문항</th><th>성취목표</th>' +
        "<th>사전 정답률</th><th>사후 정답률</th><th>차이</th></tr></thead><tbody>";
      SURVEY.know.forEach(function (it, n) {
        function rate(phase) {
          var f = phase === "pre" ? "A" : "B", hit = 0, tot = 0;
          rows.forEach(function (r) {
            var rec = r[phase]; if (!rec || !rec.k || typeof rec.k[it.id] !== "number") return;
            tot++; if (rec.k[it.id] === it[f].a) hit++;
          });
          return tot ? hit / tot * 100 : null;
        }
        var a = rate("pre"), b = rate("post");
        var d = (a == null || b == null) ? null : b - a;
        h += '<tr><td class="mono">' + (n + 1) + ". " + it.id + "</td><td>" + esc(it.goal) + "</td>" +
          '<td class="mono">' + (a == null ? "–" : Math.round(a) + "%") + "</td>" +
          '<td class="mono">' + (b == null ? "–" : Math.round(b) + "%") + "</td>" +
          '<td class="mono ' + (d > 0 ? "up" : d < 0 ? "dn" : "") + '">' +
          (d == null ? "–" : (d > 0 ? "+" : "") + Math.round(d) + "%p") + "</td></tr>";
      });
      h += "</tbody></table></div></div>";

      h += '<div class="statblk"><h4>2부 정의적 영역 <small>문항별 평균 (5점)</small></h4>' +
        '<div class="tw"><table class="grid"><thead><tr><th>문항</th><th>요인</th><th>내용</th>' +
        "<th>사전 M</th><th>사후 M</th><th>차이</th></tr></thead><tbody>";
      SURVEY.affect.items.forEach(function (it, n) {
        function m(phase) {
          var v = [];
          rows.forEach(function (r) {
            var rec = r[phase]; if (!rec || !rec.a || typeof rec.a[it.id] !== "number") return;
            v.push(it.rev ? 6 - rec.a[it.id] : rec.a[it.id]);
          });
          return v.length ? avg(v) : null;
        }
        var a = m("pre"), b = m("post"), d = (a == null || b == null) ? null : b - a;
        var fn = SURVEY.affect.factors.filter(function (f) { return f.id === it.f; })[0];
        h += '<tr><td class="mono">' + (n + 1) + "</td><td>" + esc(fn ? fn.name : it.f) + "</td>" +
          '<td class="wide">' + esc(it.t) + (it.rev ? " (역)" : "") + "</td>" +
          '<td class="mono">' + num(a) + '</td><td class="mono">' + num(b) + "</td>" +
          '<td class="mono ' + (d > 0 ? "up" : d < 0 ? "dn" : "") + '">' +
          (d == null ? "–" : (d > 0 ? "+" : "") + d.toFixed(2)) + "</td></tr>";
      });
      h += "</tbody></table></div></div>";

      h += '<div class="statblk"><h4>3부 감상 역량 <small>곡별 시대 추론 정답률</small></h4>' +
        '<div class="tw"><table class="grid"><thead><tr><th>단계</th><th>곡</th><th>정답 시대</th>' +
        "<th>정답률</th><th>근거 적절</th><th>서술 평균</th><th>응답 인원</th></tr></thead><tbody>";
      ["pre", "post"].forEach(function (ph) {
        SURVEY.perf.sets[ph].forEach(function (s) {
          var t = trackOf(s.slug), hit = 0, cue = 0, rb = [], tot = 0;
          rows.forEach(function (r) {
            var rec = r[ph]; if (!rec || !rec.p || !rec.p[s.slug]) return;
            var a = rec.p[s.slug]; tot++;
            if (a.era === t.era) hit++;
            if (a.cue && s.cue.indexOf(a.cue) > -1) cue++;
            if (typeof a.rb === "number") rb.push(a.rb);
          });
          h += "<tr><td>" + PHASES[ph] + "</td><td>" + esc(t ? p2(t.n) + ". " + t.title : s.slug) + "</td>" +
            "<td>" + esc(t ? eraName(t.era) : "–") + "</td>" +
            '<td class="mono">' + (tot ? Math.round(hit / tot * 100) + "%" : "–") + "</td>" +
            '<td class="mono">' + (tot ? Math.round(cue / tot * 100) + "%" : "–") + "</td>" +
            '<td class="mono">' + (rb.length ? avg(rb).toFixed(2) : "–") + "</td>" +
            '<td class="mono">' + tot + "</td></tr>";
        });
      });
      h += "</tbody></table></div></div>";

      var op = [];
      rows.forEach(function (r) {
        if (!r.post || !r.post.o) return;
        SURVEY.open.forEach(function (o) {
          if (r.post.o[o.id]) op.push({ sid: r.sid, name: r.name, id: o.id, t: r.post.o[o.id] });
        });
      });
      if (op.length) {
        h += '<div class="statblk"><h4>4부 개방형 응답 <small>' + op.length + "건</small></h4>";
        op.forEach(function (o) {
          h += '<div class="ans"><b>' + esc(o.sid) + " " + esc(o.name) + ' <span class="sv-tk">' + o.id + "</span></b><p>" + esc(o.t) + "</p></div>";
        });
        h += "</div>";
      }
      byId("svBody2").innerHTML = h;
    },

    setRb: function (sid, phase, slug, v) {
      var rec = Data.get(sid, phase); if (!rec) return;
      rec.p = rec.p || {};
      rec.p[slug] = rec.p[slug] || {};
      rec.p[slug].rb = v;
      Data.put(sid, phase, rec);
      toast(sid + " · " + PHASES[phase] + " " + v + "점으로 채점했습니다.");
    },

    imp: function (files) {
      if (!files || !files.length) return;
      var J = jd(); if (!J) return;
      var pend = files.length, ok = 0, bad = 0;
      var roster = J.Roster.all();
      Array.prototype.forEach.call(files, function (f) {
        var rd = new FileReader();
        rd.onload = function () {
          try {
            var d = JSON.parse(rd.result);
            if (d.app !== "jindalrae" || !d.sid) throw 0;
            var cur = roster[d.sid] || { sid: d.sid, name: d.name || "", tracks: {}, updated: "" };
            cur.name = d.name || cur.name;
            if (d.tracks) Object.keys(d.tracks).forEach(function (k) { cur.tracks[k] = d.tracks[k]; });
            if (d.survey) window.SVMerge(cur, d.survey); else if (!d.tracks) throw 0;
            cur.updated = d.exported || stamp();
            roster[d.sid] = cur;
            ok++;
          } catch (e) { bad++; }
          if (--pend === 0) fin();
        };
        rd.onerror = function () { bad++; if (--pend === 0) fin(); };
        rd.readAsText(f);
      });
      function fin() {
        J.Roster.save(roster);
        byId("svImport").value = "";
        Adm.paint();
        toast(ok + "명 불러왔습니다." + (bad ? " (" + bad + "개는 형식이 맞지 않아 건너뜀)" : ""), (bad && !ok) ? "bad" : "");
      }
    },

    /* ---------- 엑셀 ---------- */
    xls: function () {
      var rows = this.rows();
      if (!rows.length) { toast("모인 설문 응답이 없습니다.", "bad"); return; }
      if (!window.MiniXLSX) { toast("엑셀 도구를 찾지 못했습니다.", "bad"); return; }

      /* 1 요약통계 */
      var st = this.stats(rows), al = this.alphas(rows);
      var s1 = [["영역", "n", "사전 M", "사전 SD", "사후 M", "사후 SD", "평균차", "t", "df", "p", "Cohen's d", "유의"]];
      st.forEach(function (s) {
        var r = s.r;
        if (!r) { s1.push([s.label.replace(/^　· /, "  "), s.n, "", "", "", "", "", "", "", "", "", "대응 2명 미만"]); return; }
        s1.push([s.label.replace(/^　· /, "  "), r.n, round2(r.mPre), round2(r.sdPre), round2(r.mPost), round2(r.sdPost),
          round2(r.md), r.t == null ? "" : round3(r.t), r.df, r.p == null ? "" : round3(r.p),
          r.d == null ? "" : round2(r.d),
          r.p == null ? "" : (r.p < 0.001 ? "***" : r.p < 0.01 ? "**" : r.p < 0.05 ? "*" : "n.s.")]);
      });
      s1.push([]);
      s1.push(["Cronbach α (정의적 16문항)", "사전", al.pre == null ? "" : round3(al.pre), "사후", al.post == null ? "" : round3(al.post)]);
      s1.push(["* p<.05  ** p<.01  *** p<.001 · 대응표본 t검정(양측)"]);
      s1.push(["Cohen's d = 평균차 / 차이점수의 표준편차 (dz)"]);

      /* 2 학생별 */
      var head2 = ["학번", "학년반번", "이름", "지식_사전", "지식_사후", "지식_향상",
        "정의적_사전", "정의적_사후", "정의적_향상"];
      SURVEY.affect.factors.forEach(function (f) { head2.push(f.name + "_사전", f.name + "_사후"); });
      head2.push("감상자동_사전", "감상자동_사후", "감상서술포함_사전", "감상서술포함_사후", "시대추론_사전", "시대추론_사후");
      var s2 = [head2];
      rows.forEach(function (r) {
        var line = [r.sid, jd().Auth.label(r.sid), r.name,
          r.kPre ? r.kPre.right : "", r.kPost ? r.kPost.right : "",
          (r.kPre && r.kPost) ? (r.kPost.right - r.kPre.right) : "",
          r.aPre && r.aPre.mean != null ? round2(r.aPre.mean) : "",
          r.aPost && r.aPost.mean != null ? round2(r.aPost.mean) : "",
          (r.aPre && r.aPost && r.aPre.mean != null && r.aPost.mean != null) ? round2(r.aPost.mean - r.aPre.mean) : ""];
        SURVEY.affect.factors.forEach(function (f) {
          line.push(r.aPre && r.aPre.f[f.id] != null ? round2(r.aPre.f[f.id]) : "");
          line.push(r.aPost && r.aPost.f[f.id] != null ? round2(r.aPost.f[f.id]) : "");
        });
        line.push(r.pPre ? r.pPre.objective : "", r.pPost ? r.pPost.objective : "",
          r.pPre && r.pPre.total != null ? r.pPre.total : "", r.pPost && r.pPost.total != null ? r.pPost.total : "",
          r.pPre ? r.pPre.eraHit : "", r.pPost ? r.pPost.eraHit : "");
        s2.push(line);
      });

      /* 3 지식 원자료 + 문항별 */
      var s3 = [["학번", "이름", "단계"].concat(SURVEY.know.map(function (it, i) { return (i + 1) + "." + it.id; })).concat(["정답 수"])];
      rows.forEach(function (r) {
        ["pre", "post"].forEach(function (ph) {
          var rec = r[ph]; if (!rec) return;
          var f = ph === "pre" ? "A" : "B";
          var line = [r.sid, r.name, PHASES[ph]];
          var hit = 0;
          SURVEY.know.forEach(function (it) {
            var v = rec.k ? rec.k[it.id] : undefined;
            if (typeof v !== "number") { line.push(""); return; }
            var ok = v === it[f].a; if (ok) hit++;
            line.push((v + 1) + (ok ? " O" : " X"));
          });
          line.push(hit);
          s3.push(line);
        });
      });
      var s3b = [["문항", "성취목표", "사전 정답률(%)", "사후 정답률(%)", "차이(%p)"]];
      SURVEY.know.forEach(function (it, n) {
        function rate(phase) {
          var f = phase === "pre" ? "A" : "B", hit = 0, tot = 0;
          rows.forEach(function (r) {
            var rec = r[phase]; if (!rec || !rec.k || typeof rec.k[it.id] !== "number") return;
            tot++; if (rec.k[it.id] === it[f].a) hit++;
          });
          return tot ? hit / tot * 100 : null;
        }
        var a = rate("pre"), b = rate("post");
        s3b.push([(n + 1) + "." + it.id, it.goal, a == null ? "" : round1(a), b == null ? "" : round1(b),
          (a == null || b == null) ? "" : round1(b - a)]);
      });

      /* 4 정의적 원자료 */
      var s4 = [["학번", "이름", "단계"].concat(SURVEY.affect.items.map(function (it, i) {
        return (i + 1) + "." + it.id + (it.rev ? "(역)" : "");
      })).concat(["전체평균"]).concat(SURVEY.affect.factors.map(function (f) { return f.name; }))];
      rows.forEach(function (r) {
        ["pre", "post"].forEach(function (ph) {
          var rec = r[ph]; if (!rec) return;
          var sc = affectScore(rec);
          var line = [r.sid, r.name, PHASES[ph]];
          SURVEY.affect.items.forEach(function (it) {
            var raw = rec.a ? rec.a[it.id] : undefined;
            line.push(typeof raw === "number" ? raw : "");
          });
          line.push(sc.mean == null ? "" : round2(sc.mean));
          SURVEY.affect.factors.forEach(function (f) { line.push(sc.f[f.id] == null ? "" : round2(sc.f[f.id])); });
          s4.push(line);
        });
      });

      /* 5 감상 역량 */
      var s5 = [["학번", "이름", "단계", "곡", "정답 시대", "학생 응답", "시대 정오", "근거 요소", "근거 적절", "서술", "루브릭(0~3)", "곡 점수(5)"]];
      rows.forEach(function (r) {
        ["pre", "post"].forEach(function (ph) {
          var sc = ph === "pre" ? r.pPre : r.pPost; if (!sc) return;
          sc.per.forEach(function (one) {
            var t = trackOf(one.slug);
            var pt = (one.eraOk ? 1 : 0) + (one.cueOk ? 1 : 0) + (typeof one.rb === "number" ? one.rb : 0);
            s5.push([r.sid, r.name, PHASES[ph], t ? p2(t.n) + ". " + t.title : one.slug,
              t ? eraName(t.era) : "", one.ans.era ? eraName(one.ans.era) : "",
              one.eraOk ? "O" : (one.ans.era ? "X" : ""), one.ans.cue || "",
              one.cueOk ? "O" : (one.ans.cue ? "X" : ""), one.ans.why || "",
              typeof one.rb === "number" ? one.rb : "", typeof one.rb === "number" ? pt : ""]);
          });
        });
      });

      /* 6 개방형 */
      var s6 = [["학번", "이름", "문항", "내용", "응답"]];
      rows.forEach(function (r) {
        if (!r.post || !r.post.o) return;
        SURVEY.open.forEach(function (o) {
          if (r.post.o[o.id]) s6.push([r.sid, r.name, o.id, o.t, r.post.o[o.id]]);
        });
      });

      /* 7 문항 전문 (부록용) */
      var s7 = [["구분", "번호", "문항 / 내용", "보기 1", "보기 2", "보기 3", "보기 4", "보기 5", "정답"]];
      SURVEY.know.forEach(function (it, n) {
        ["A", "B"].forEach(function (f) {
          var q = it[f];
          s7.push(["1부 지식 " + (f === "A" ? "사전(A형)" : "사후(B형)"), n + 1, q.q,
            q.o[0], q.o[1], q.o[2], q.o[3], "", (q.a + 1) + "번"]);
        });
      });
      SURVEY.affect.items.forEach(function (it, n) {
        s7.push(["2부 정의적" + (it.rev ? " (역문항)" : ""), n + 1, it.t].concat(SURVEY.affect.scale).concat([""]));
      });
      ["pre", "post"].forEach(function (ph) {
        SURVEY.perf.sets[ph].forEach(function (s, n) {
          var t = trackOf(s.slug);
          s7.push(["3부 감상 " + PHASES[ph] + "세트", n + 1,
            (t ? p2(t.n) + ". " + t.title : s.slug) + " — 시대 추론 / 근거 요소 / 근거 서술",
            "", "", "", "", "", (t ? eraName(t.era) : "") + " · 근거 " + s.cue.join(" 또는 ")]);
        });
      });
      SURVEY.open.forEach(function (o, n) { s7.push(["4부 개방형", n + 1, o.t, "", "", "", "", "", ""]); });
      s7.push([]);
      s7.push(["3부 서술 채점 기준"].concat(SURVEY.perf.rubric));

      MiniXLSX.download("사전사후설문_분석_" + fstamp() + ".xlsx", [
        { name: "요약통계", rows: s1, widths: [30, 6, 9, 9, 9, 9, 9, 9, 6, 9, 11, 9] },
        { name: "학생별", rows: s2, widths: [8, 14, 10].concat(new Array(head2.length - 3).fill(12)) },
        { name: "지식 원자료", rows: s3, widths: [8, 10, 7].concat(new Array(SURVEY.know.length).fill(7)).concat([8]) },
        { name: "지식 문항분석", rows: s3b, widths: [10, 34, 13, 13, 11] },
        { name: "정의적 원자료", rows: s4, widths: [8, 10, 7].concat(new Array(SURVEY.affect.items.length).fill(7)).concat([10, 14, 14, 14, 14]) },
        { name: "감상역량", rows: s5, widths: [8, 10, 7, 20, 12, 12, 9, 16, 9, 46, 11, 10] },
        { name: "개방형", rows: s6, widths: [8, 10, 6, 40, 60] },
        { name: "문항 전문", rows: s7, widths: [20, 6, 60, 22, 22, 22, 22, 16, 20] }
      ]);
      toast("분석 엑셀을 내려받았습니다. (시트 8장)");
    },

    /* ---------- 설문지 인쇄 (부록용) ---------- */
    print: function () {
      var h = '<div class="pr-head"><h1>진달래꽃 × 서양음악사 — 사전·사후 설문지</h1><p>' +
        esc(CONFIG.schoolName + " " + CONFIG.subject) + " · 단일집단 사전-사후 설계 · 출력 " + stamp() + "</p></div>";

      ["A", "B"].forEach(function (f) {
        h += '<div class="pr-item"><h2>[' + (f === "A" ? "사전 A형" : "사후 B형") + "] 1부 · 음악사 지식 15문항</h2>";
        SURVEY.know.forEach(function (it, n) {
          h += "<p><b>" + (n + 1) + ".</b> " + esc(it[f].q) + "<br>" +
            it[f].o.map(function (o, k) { return "　" + (k + 1) + ") " + esc(o); }).join("<br>") + "</p>";
        });
        h += "</div>";
      });

      h += '<div class="pr-item"><h2>2부 · 정의적 영역 16문항 (사전·사후 동일)</h2><table>' +
        "<tr><th>문항</th><th>1 – 2 – 3 – 4 – 5</th></tr>" +
        SURVEY.affect.items.map(function (it, n) {
          return "<tr><th>" + (n + 1) + ". " + esc(it.t) + (it.rev ? " (역문항)" : "") + "</th><td>① ② ③ ④ ⑤</td></tr>";
        }).join("") + "</table><p>" +
        SURVEY.affect.scale.map(function (s, i) { return (i + 1) + "=" + esc(s); }).join("　") + "</p></div>";

      ["pre", "post"].forEach(function (ph) {
        h += '<div class="pr-item"><h2>3부 · 감상 역량 (' + PHASES[ph] + " 세트 " + SURVEY.perf.sets[ph].length + "곡)</h2>";
        SURVEY.perf.sets[ph].forEach(function (s, n) {
          var t = trackOf(s.slug);
          h += "<p><b>감상 " + (n + 1) + ".</b> (음원: " + esc(t ? p2(t.n) + " " + t.title : s.slug) +
            " · 정답 " + esc(t ? eraName(t.era) : "") + ")<br>" +
            "　① 어느 시대의 음악이라고 생각하나요? " + ERAS.map(function (e) { return esc(e.name); }).join(" / ") + "<br>" +
            "　② 가장 결정적인 근거는? " + SURVEY.perf.cues.map(function (c) { return esc(c); }).join(" / ") +
            "　(적절한 근거: " + esc(s.cue.join(" 또는 ")) + ")<br>" +
            "　③ 근거를 음악 요소를 들어 한두 문장으로 쓰세요.<br>　_______________________________________________</p>";
        });
        h += "</div>";
      });

      h += '<div class="pr-item"><h2>4부 · 개방형 (사후에만)</h2>' +
        SURVEY.open.map(function (o, n) {
          return "<p><b>" + (n + 1) + ".</b> " + esc(o.t) + "<br>　_______________________________________________</p>";
        }).join("") + "</div>";

      h += '<div class="pr-item"><h2>3부 서술 채점 기준</h2><p>' +
        SURVEY.perf.rubric.map(function (x) { return esc(x); }).join("<br>") + "</p></div>";

      byId("printArea").innerHTML = h;
      window.print();
    }
  };

  /* ============================================================
     시작 — app.js 가 창구를 열어 준 뒤에 붙는다
     ============================================================ */
  function boot() {
    if (!byId("svBody") || !byId("svBody2")) return;
    Sv.start();
    Adm.start();

    /* 로그인 결과에 맞춰 화면을 준비한다 */
    window.SVOpen = function (role) {
      if (role === "teacher") Adm.render();
      else Sv.open();
    };
    var J = jd();
    if (J && J.Auth && J.Auth.me) window.SVOpen(J.Auth.me.role);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
