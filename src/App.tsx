import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import rawCards from "./data/cards.json";
import { COURSES, ADAPTIVE_COURSE_IDS, PAIR_COUNT, SKILLS, SKILL_BY_ID, SOURCE_URLS } from "./lib/catalog.mjs";
import {
  newProfile,
  parseProfile,
  STORAGE_KEY,
  exportProfile,
  importProfile,
  startSession,
  advanceSession,
  grade,
  recordHint,
  nextCard,
  mastery,
  masteredCount,
  targetKey,
  skillProgress,
} from "./lib/engine.mjs";
import { createProfileStore } from "./lib/profile-store.mjs";
import { createStatisticsClock } from "./lib/statistics-clock.mjs";
import { recordTime } from "./lib/statistics.mjs";
import { usageSentenceParts } from "./lib/sentence-parts.mjs";
import type { Card, Part, Profile, Mode, AnswerMode } from "./types";

const DEFAULT_CARDS = rawCards as Card[];
const exclusive = navigator.locks
  ? async <T,>(fn: () => Promise<T>): Promise<T> =>
      (await navigator.locks.request(`${STORAGE_KEY}-write`, fn)) as T
  : null;
const routeFor = () => location.hash.slice(1) || "/practice";
const rate = (n: number, d: number) =>
  d ? `${Math.round((n / d) * 100)}%` : "—";
function Japanese({ parts, reading }: { parts: Part[]; reading: boolean }) {
  return (
    <span lang="ja">
      {parts
        .flatMap((part) => usageSentenceParts(part))
        .map((part: Part, i: number) =>
          part.reading && reading ? (
            <ruby key={i}>
              {part.text}
              <rt>{part.reading}</rt>
            </ruby>
          ) : (
            <span key={i}>{part.text}</span>
          ),
        )}
    </span>
  );
}
function SkillTitle({ id }: { id: string }) {
  const text = SKILL_BY_ID.get(id)?.title ?? id;
  if (id.startsWith("verb.")) return <span lang="ja">{text}</span>;
  return (
    <>
      {text.split(/([ぁ-ゖァ-ヺー]+)/u).map((part: string, i: number) =>
        /[ぁ-ゖァ-ヺー]/u.test(part) ? (
          <span lang="ja" key={i}>
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}
function Sentence({
  card,
  revealed,
  reading,
}: {
  card: Card;
  revealed: boolean;
  reading: boolean;
}) {
  if (card.exerciseType === "verb-role")
    return (
      <p className="sentence" lang="ja">
        <Japanese parts={[...card.before, ...card.after]} reading={reading} />
      </p>
    );
  const answer = card.options.find((o) => card.answerIds.includes(o.id))!;
  const punctuation =
    card.after[0]?.text.match(/^[。、！？!?」』）]+/u)?.[0] ?? "";
  const after = punctuation
    ? [
        {
          ...card.after[0],
          text: card.after[0].text.slice(punctuation.length),
          reading: card.after[0].reading?.slice(punctuation.length),
        },
        ...card.after.slice(1),
      ]
    : card.after;
  return (
    <p className="sentence" lang="ja">
      <Japanese parts={card.before} reading={reading} />
      <span className="sentence-slot">
        {revealed ? (
          <mark>
            <Japanese parts={[answer]} reading={reading} />
          </mark>
        ) : (
          <span
            className={`sentence-blank ${card.skillId.startsWith("particle.") ? "particle-blank" : ""}`}
            aria-label="回答する箇所"
          />
        )}
        {punctuation}
      </span>
      <Japanese parts={after} reading={reading} />
    </p>
  );
}
function saveFile(name: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
function download(p: Profile) {
  saveFile(
    `bunpo-dojo-progress-${new Date().toLocaleDateString("sv-SE")}.json`,
    exportProfile(p),
  );
}

export default function App({ cards: CARDS = DEFAULT_CARDS }: { cards?: Card[] } = {}) {
  const [store] = useState(() =>
    createProfileStore(() => localStorage, STORAGE_KEY, exclusive),
  );
  const [initial] = useState(() => {
    const read = store.read();
    try {
      return {
        profile: read.raw ? parseProfile(read.raw, CARDS) : newProfile(),
        notice: read.error
          ? "浏览器存储不可用，进度暂存在内存，请及时导出。"
          : "",
        raw: read.raw,
        corrupt: false,
        blocked: false,
      };
    } catch {
      return {
        profile: newProfile(),
        notice: "本地进度无法读取。原数据未改写，请先导出原数据或检查备份。",
        blocked: true,
        raw: read.raw,
        corrupt: true,
      };
    }
  });
  const [profile, setProfile] = useState<Profile>(initial.profile),
    profileRef = useRef(profile);
  const [route, setRoute] = useState(routeFor),
    [notice, setNotice] = useState(initial.notice),
    [blocked, setBlocked] = useState(!!initial.blocked),
    [busy, setBusy] = useState(false),
    [corrupt, setCorrupt] = useState(initial.corrupt);
  const [answer, setAnswer] = useState(profile.session?.answer ?? ""),
    [selectedCourses, setSelectedCourses] = useState<string[]>(
      profile.session?.mode === "challenge"
        ? profile.session.courses
        : ["mixed"],
    ),
    [filter, setFilter] = useState("");
  const [clock] = useState(() => createStatisticsClock()),
    writeTail = useRef(Promise.resolve()),
    feedback = useRef<HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null),
    file = useRef<HTMLInputElement>(null);
  const session = profile.session,
    card = CARDS.find((c) => c.id === session?.cardId),
    playing = route === "/practice" || route === "/challenge/play",
    matchingMode =
      !!session &&
      (session.mode === "challenge"
        ? route === "/challenge/play"
        : route === "/practice"),
    reading = profile.preferences.reading;
  const commit = useCallback(
    (update: (p: Profile) => Profile, recover = false) => {
      const operation = writeTail.current.then(async () => {
        if (blocked && !recover) return false;
        const next = update(profileRef.current),
          status = await store.save(next);
        if (status === "conflict") {
          setBlocked(true);
          setNotice("另一个标签页已保存更新。为避免覆盖，请重新加载最新进度。");
          return false;
        }
        profileRef.current = next;
        setProfile(next);
        if (recover) {
          setBlocked(false);
          setCorrupt(false);
        }
        if (status === "unsaved")
          setNotice("保存失败，进度仍在当前页面。请导出备份后继续。");
        return true;
      });
      writeTail.current = operation.then(
        () => {},
        () => {},
      );
      return operation;
    },
    [store, blocked],
  );
  const navigate = useCallback((path: string) => {
    location.hash = path;
    setRoute(path);
  }, []);
  const drainTime = useCallback(() => {
    const fragments = clock.drain();
    if (!fragments.length) return;
    void commit((p) => ({
      ...p,
      statistics: recordTime(p.statistics, fragments),
    }));
  }, [clock, commit]);
  useEffect(() => {
    const onRoute = () => {
      drainTime();
      setRoute(routeFor());
    };
    window.addEventListener("hashchange", onRoute);
    return () => window.removeEventListener("hashchange", onRoute);
  }, [drainTime]);
  useEffect(() => {
    const update = () =>
      clock.setContext({
        enabled:
          playing &&
          matchingMode &&
          !!session &&
          !session.finished &&
          !blocked &&
          !document.hidden &&
          document.hasFocus(),
        answering: !session?.result,
        domain: card?.module ?? "grammar",
        courseId: card?.courseId ?? "",
      });
    const touch = () => clock.touch();
    const boundary = () => {
      update();
      drainTime();
    };
    update();
    const timer = setInterval(drainTime, 30000);
    for (const type of ["pointerdown", "keydown", "scroll"])
      window.addEventListener(type, touch);
    for (const type of ["focus", "blur", "pagehide"])
      window.addEventListener(type, boundary);
    document.addEventListener("visibilitychange", boundary);
    return () => {
      clearInterval(timer);
      for (const type of ["pointerdown", "keydown", "scroll"])
        window.removeEventListener(type, touch);
      for (const type of ["focus", "blur", "pagehide"])
        window.removeEventListener(type, boundary);
      document.removeEventListener("visibilitychange", boundary);
      clock.setContext({ enabled: false });
    };
  }, [clock, playing, matchingMode, session, blocked, card, drainTime]);
  useEffect(() => {
    const change = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && store.isExternalChange(event.newValue)) {
        setBlocked(true);
        setNotice("其他标签页已更新进度，请重新加载。");
      }
    };
    window.addEventListener("storage", change);
    return () => window.removeEventListener("storage", change);
  }, [store]);
  useEffect(() => {
    if (!session?.result) return;
    requestAnimationFrame(() => {
      const rect = feedback.current?.getBoundingClientRect();
      if (rect && (rect.top < 80 || rect.bottom > innerHeight))
        feedback.current?.scrollIntoView({
          block: "start",
          behavior: "smooth",
        });
    });
  }, [session?.result]);
  const start = useCallback(
    async (mode: Mode, courses: string[]) => {
      if (!courses.length || busy) return;
      setBusy(true);
      drainTime();
      const ok = await commit((p) => startSession(p, CARDS, { mode, courses }));
      setBusy(false);
      if (ok) {
        setAnswer("");
        clock.resetAnswer();
        navigate(mode === "challenge" ? "/challenge/play" : "/practice");
      }
    },
    [busy, clock, commit, drainTime, navigate, CARDS],
  );
  const next = useCallback(async () => {
    if (!session || busy) return;
    setBusy(true);
    drainTime();
    await commit((p) => advanceSession(p, CARDS));
    setBusy(false);
    setAnswer("");
    clock.resetAnswer();
    requestAnimationFrame(() => {
      document
        .querySelector(".exercise-card")
        ?.scrollIntoView({ block: "start", behavior: "smooth" });
      input.current?.focus({ preventScroll: true });
    });
  }, [session, busy, drainTime, commit, clock, CARDS]);
  const submit = useCallback(
    async (revealed = false) => {
      if (
        !card ||
        !session ||
        session.result ||
        busy ||
        blocked ||
        (!revealed && !answer.trim())
      )
        return;
      setBusy(true);
      drainTime();
      await commit((p) => {
        const graded = grade(p, card, {
          questionId: session.questionId,
          answer,
          revealed,
          hint: session.hint,
          answerMode: session.answerMode,
          mode: session.mode,
          cards: CARDS,
        });
        if (graded.retry)
          setNotice(
            "这个汉字词形可能有不同读法。请用假名输入，以确认本题词对；当前输入未计入题数或成绩。",
          );
        return graded.profile;
      });
      setBusy(false);
    },
    [card, session, busy, blocked, answer, commit, drainTime, CARDS],
  );
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        !playing ||
        !matchingMode ||
        busy ||
        blocked ||
        e.isComposing ||
        e.keyCode === 229 ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        !session ||
        session.finished
      )
        return;
      if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        if (session.result) void next();
        else void submit();
      } else if (
        !session.result &&
        session.answerMode === "choice" &&
        card &&
        /^[1-9]$/.test(e.key)
      ) {
        const option = card.options[Number(e.key) - 1];
        if (option) {
          setAnswer(option.text);
          void commit((p) =>
            p.session
              ? { ...p, session: { ...p.session, answer: option.text } }
              : p,
          );
        }
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [
    playing,
    matchingMode,
    busy,
    blocked,
    session,
    card,
    next,
    submit,
    commit,
  ]);
  const saveAnswer = (value: string) => {
    setAnswer(value);
    void commit((p) => {
      if (!p.session || p.session.result) return p;
      return { ...p, session: { ...p.session, answer: value } };
    });
  };
  async function hint() {
    if (!session || !card || busy || session.result) return;
    setBusy(true);
    await commit((p) => recordHint(p, card, session.questionId, session.mode));
    setBusy(false);
  }
  async function end() {
    drainTime();
    await commit((p) =>
      p.session ? { ...p, session: { ...p.session, finished: true } } : p,
    );
  }
  async function changeAnswerMode(mode: AnswerMode) {
    await commit((p) => ({
      ...p,
      preferences: { ...p.preferences, answerMode: mode },
      session: p.session ? { ...p.session, answerMode: mode } : null,
    }));
  }
  async function importFile(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    if (!chosen) return;
    try {
      const p = importProfile(await chosen.text(), CARDS) as Profile;
      const ok = await commit(() => p, corrupt);
      if (ok) {
        clock.reset();
        setAnswer(p.session?.answer ?? "");
        setNotice("备份已导入，统计与待复测已恢复。");
        navigate("/practice");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "备份无法读取。");
    }
    event.target.value = "";
  }
  const finishStart = () =>
    start(
      session?.mode ?? "practice",
      session?.courses ?? ADAPTIVE_COURSE_IDS,
    );
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        playing &&
        matchingMode &&
        session?.finished &&
        e.key === "Enter" &&
        !e.isComposing &&
        !(e.target instanceof HTMLButtonElement)
      ) {
        e.preventDefault();
        void start(session.mode, session.courses);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [playing, matchingMode, session, start]);
  const nextFocus = session
    ? nextCard(profile, CARDS, {
        mode: session.mode,
        courses: session.courses,
        index: 0,
      })
    : null;
  const pending = Object.values(profile.pending),
    s = profile.statistics;
  const choiceSelected = card?.options.find((o) => o.text === answer);
  const modeTitle = session?.mode === "challenge" ? "自由挑战" : "自适应练习";

  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="brand" href="#/practice">
          <span className="brand-mark">
            <span className="brand-glyph">文</span>
          </span>
          <span>
            <strong>文法道场</strong>
            <small>BUNPŌ PRACTICE</small>
          </span>
        </a>
        <nav aria-label="主导航">
          <a
            className={route === "/practice" ? "active" : ""}
            href="#/practice"
            onClick={(e) => {
              if (session?.mode === "challenge") {
                e.preventDefault();
                void start(
                  "practice",
                  ADAPTIVE_COURSE_IDS,
                );
              }
            }}
          >
            练习
          </a>
          <a
            className={route.startsWith("/challenge") ? "active" : ""}
            href="#/challenge"
          >
            自由挑战
          </a>
          <a className={route === "/stats" ? "active" : ""} href="#/stats">
            统计
          </a>
          <a className={route === "/library" ? "active" : ""} href="#/library">
            课程
          </a>
        </nav>
        <span className="header-count">
          已掌握{" "}
          <b>
            {masteredCount(profile)} / {SKILLS.length}
          </b>
        </span>
        <a
          className="github-link"
          href="https://github.com/L-M-Sherlock/bunpo-dojo"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub 源代码（新标签页打开）"
        >
          GitHub <span aria-hidden="true">↗</span>
        </a>
      </header>
      {notice && (
        <aside className="notice" role="status">
          {notice}{" "}
          {blocked && (
            <button onClick={() => location.reload()}>重新加载</button>
          )}
          {corrupt && initial.raw && (
            <button
              onClick={() =>
                saveFile("bunpo-dojo-unreadable-local.json", initial.raw!)
              }
            >
              导出原始本地数据
            </button>
          )}
          <button onClick={() => download(profileRef.current)}>
            导出当前进度
          </button>
        </aside>
      )}
      <main
        className={route === "/challenge/play" ? "main challenge-play" : "main"}
      >
        {route === "/challenge" && (
          <section className="page-panel">
            <p className="eyebrow">自由挑战</p>
            <h1>选择想练的用法。</h1>
            <p className="lede">
              可多选课程，持续练习直到你主动结束。错题保留在挑战复测中。
            </p>
            <div className="selection-actions">
              <button
                onClick={() => setSelectedCourses(COURSES.map((c) => c.id))}
              >
                全选
              </button>
              <button onClick={() => setSelectedCourses([])}>清空</button>
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="搜索课程"
                aria-label="搜索挑战课程"
              />
            </div>
            <div className="course-grid">
              {COURSES.filter((c) =>
                `${c.title}${c.subtitle}`.includes(filter),
              ).map((c) => (
                <label
                  className={`course-option ${selectedCourses.includes(c.id) ? "selected" : ""}`}
                  key={c.id}
                  htmlFor={`course-${c.id}`}
                  aria-label={c.title}
                >
                  <input
                    type="checkbox"
                    id={`course-${c.id}`}
                    checked={selectedCourses.includes(c.id)}
                    onChange={() =>
                      setSelectedCourses((p) =>
                        p.includes(c.id)
                          ? p.filter((id) => id !== c.id)
                          : [...p, c.id],
                      )
                    }
                  />
                  <span>
                    <strong>{c.title}</strong>
                    <small lang={c.group === "particles" ? "ja" : undefined}>
                      {c.subtitle}
                    </small>
                    <p>{c.description}</p>
                    <em>
                      {CARDS.filter((q) => q.courseId === c.id).length} 个场景
                    </em>
                  </span>
                </label>
              ))}
            </div>
            <div className="selection-footer">
              <span>已选 {selectedCourses.length} 门课程</span>
              <button
                className="primary"
                disabled={!selectedCourses.length || busy || blocked}
                onClick={() => start("challenge", selectedCourses)}
              >
                开始无限挑战 →
              </button>
            </div>
            <PendingList queue="challenge" />
          </section>
        )}
        {route === "/stats" && (
          <section className="page-panel">
            <p className="eyebrow">学习统计</p>
            {session && !session.finished && (
              <button
                className="text-button"
                onClick={() =>
                  navigate(
                    session.mode === "challenge"
                      ? "/challenge/play"
                      : "/practice",
                  )
                }
              >
                返回当前{session.mode === "challenge" ? "挑战" : "练习"} →
              </button>
            )}
            <h1>看见用法逐渐清晰。</h1>
            <p className="lede">
              按实际作答的词对和助词用法记录。辅助练习与独立作答分开统计。
            </p>
            <div className="metric-grid">
              {[
                ["整题作答", s.questions],
                ["独立正确率", rate(s.independentCorrect, s.independent)],
                ["已掌握用法", `${masteredCount(profile)} / ${SKILLS.length}`],
                ["有效练习时间", `${Math.round(s.activeMs / 60000)} 分钟`],
                ["独立复测成功率", rate(s.retestCorrect, s.retests)],
                ["待复测", pending.length],
              ].map(([label, value]) => (
                <article key={label}>
                  <small>{label}</small>
                  <strong>{value}</strong>
                </article>
              ))}
            </div>
            <h2>最近的练习</h2>
            <div className="activity-chart" aria-label="每日整题数">
              {Object.entries(s.days)
                .sort(([a], [b]) => a.localeCompare(b))
                .slice(-14)
                .map(([day, v]) => (
                  <div key={day}>
                    <span
                      className="bar"
                      style={{
                        height: Math.max(
                          4,
                          Math.min(130, (v.questions ?? 0) * 4),
                        ),
                      }}
                    />
                    <b>{v.questions ?? 0}</b>
                    <small>{day.slice(5)}</small>
                  </div>
                ))}
              {!Object.keys(s.days).length && (
                <p className="empty">完成第一题后，这里会显示练习记录。</p>
              )}
            </div>
            <h2>已练习的薄弱项</h2>
            <div className="skill-list">
              {SKILLS.filter(
                (k) =>
                  profile.bySkill[k.id]?.attempts &&
                  !mastery(k, profile.bySkill[k.id]),
              )
                .sort(
                  (a, b) =>
                    profile.bySkill[a.id].confidence -
                    profile.bySkill[b.id].confidence,
                )
                .map((k) => (
                  <SkillRow key={k.id} id={k.id} />
                ))}
              {!SKILLS.some(
                (k) =>
                  profile.bySkill[k.id]?.attempts &&
                  !mastery(k, profile.bySkill[k.id]),
              ) && <p className="empty">暂时没有已练习但未达标的用法。</p>}
            </div>
            <PendingList queue="practice" />
            <PendingList queue="challenge" />
            <h2>作答记录</h2>
            <div className="log-list">
              {profile.events
                .slice(-20)
                .reverse()
                .map((e) => {
                  const eventCard = CARDS.find((c) => c.id === e.cardId),
                    verbRole = eventCard?.exerciseType === "verb-role";
                  return (
                  <details key={e.id}>
                    <summary>
                      <SkillTitle id={e.skillId} /> ·{" "}
                      {e.correct ? "答对" : "待复测"}
                      <small>
                        {new Date(e.at).toLocaleString()} ·{" "}
                        {e.independent ? "独立" : "辅助"} ·{" "}
                        {e.mode === "challenge" ? "挑战" : "练习"}
                      </small>
                    </summary>
                    <p>
                      你的答案：<span lang={verbRole ? undefined : "ja"}>{e.answer || "查看答案"}</span>
                    </p>
                    <p>{eventCard?.scene}</p>
                    <p>
                      {verbRole
                        ? e.kind === "unknown"
                          ? "输入未匹配自他类别"
                          : e.correct
                            ? "动词类别判断正确"
                            : "查看本句自他类别的判断依据"
                        : e.kind === "meaning-mismatch"
                        ? "表达的意思与场景不同"
                        : e.kind === "unknown"
                          ? "输入未匹配已审核选项"
                          : e.correct
                            ? "与场景相符"
                            : "查看本题选项解释"}
                    </p>
                  </details>
                  );
                })}
            </div>
            <div className="backup-actions">
              <button onClick={() => download(profileRef.current)}>
                导出进度 JSON
              </button>
              <button
                disabled={(blocked && !corrupt) || busy}
                onClick={() => file.current?.click()}
              >
                导入进度
              </button>
              <button
                onClick={() => {
                  if (
                    confirm(
                      "清空文法道场的全部本地学习进度？此操作可用已导出的备份恢复。",
                    )
                  ) {
                    void commit(() => newProfile() as Profile, corrupt);
                    setAnswer("");
                    clock.reset();
                  }
                }}
              >
                重置进度
              </button>
              <input
                hidden
                ref={file}
                type="file"
                accept="application/json,.json"
                onChange={importFile}
              />
            </div>
          </section>
        )}
        {route === "/library" && (
          <section className="page-panel">
            <p className="eyebrow">课程与知识点</p>
            <h1>每一个区别，都有具体场景。</h1>
            <p className="lede">
              {CARDS.length} 个审核场景 · {PAIR_COUNT} 组词对 · 10
              项助词用法。选择课程可直接练习。
            </p>
            {COURSES.map((c) => (
              <section key={c.id} className="library-course">
                <div>
                  <h2>{c.title}</h2>
                  <p>{c.description}</p>
                  <button
                    onClick={() => start("practice", [c.id])}
                    disabled={busy || blocked}
                  >
                    练习本课 →
                  </button>
                </div>
                {SKILLS.filter((k) => k.courseId === c.id).map((k) => (
                  <SkillRow id={k.id} key={k.id} />
                ))}
                {c.id === "mixed" && (
                  <p>
                    综合题只评估当前空格的用法，成绩回到相应词对或助词知识点。
                  </p>
                )}
              </section>
            ))}
            <h2>规则参考</h2>
            <p>场景为本项目原创，经逐题独立审核；下列资料用于核实语法规则。</p>
            {Object.entries(SOURCE_URLS).map(([id, url]) => (
              <p key={id}>
                <a href={url} target="_blank" rel="noreferrer">
                  {id === "jf-pairs"
                    ? "国际交流基金 自他动词资料"
                    : id === "tufs-case"
                      ? "东京外国语大学 格助词说明"
                      : "东京外国语大学 移动目的地说明"}{" "}
                  ↗
                </a>
              </p>
            ))}
          </section>
        )}
        {playing && (!session || !card || !matchingMode) && (
          <section className="landing">
            <div className="landing-intro">
              <p className="eyebrow">日语用法辨析</p>
              <h1>
                一句话，
                <br />
                选对它的意思。
              </h1>
              <p className="lede">
                从「门开了」到「我开了门」，
                <br />
                在具体场景中练会自他动词与助词。
              </p>
              <button
                className="primary"
                disabled={busy || blocked || !CARDS.length}
                onClick={() =>
                  start(
                    "practice",
                    ADAPTIVE_COURSE_IDS,
                  )
                }
              >
                开始自适应练习 →
              </button>
              <a className="quiet-link" href="#/challenge">
                已经学过？直接自由挑战
              </a>
              <div className="landing-facts">
                <span>
                  <b>{PAIR_COUNT}</b> 自他词对
                </span>
                <span>
                  <b>10</b> 助词用法
                </span>
                <span>
                  <b>{CARDS.length}</b> 具体场景
                </span>
              </div>
            </div>
            <div className="landing-courses">
              {COURSES.map((c, i) => (
                <button
                  key={c.id}
                  disabled={busy || blocked}
                  onClick={() => start("practice", [c.id])}
                >
                  <small>0{i + 1}</small>
                  <span>
                    <strong>{c.title}</strong>
                    <em lang={c.group === "particles" ? "ja" : undefined}>
                      {c.subtitle}
                    </em>
                  </span>
                  <b>↗</b>
                </button>
              ))}
              <p>可随时自选课程，两个网站的学习进度分别保存。</p>
            </div>
          </section>
        )}
        {playing && matchingMode && session && card && session.finished && (
          <section className="completion">
            <p lang="ja" className="completion-jp">
              おつかれさま
            </p>
            <h1>
              {session.mode === "challenge" ? "本次挑战结束" : "本轮完成"}
            </h1>
            <div className="score">
              {session.correct}
              <small>/ {session.answered}</small>
            </div>
            <p>当前输入未提交的题目不计入结果。</p>
            {nextFocus && (
              <div className="focus-card">
                <small>下一轮实际重点</small>
                <strong>
                  <SkillTitle id={nextFocus.skillId} />
                </strong>
              </div>
            )}
            <button
              className="primary"
              disabled={busy || blocked}
              onClick={finishStart}
            >
              继续{session.mode === "challenge" ? "挑战" : "下一轮"} →
            </button>
            <button
              className="text-button"
              onClick={() => navigate("/library")}
            >
              自选其他课程
            </button>
          </section>
        )}
        {playing && matchingMode && session && card && !session.finished && (
          <div
            className={`practice-layout ${session.mode === "challenge" ? "single" : ""}`}
          >
            {session.mode === "practice" && (
              <aside className="practice-sidebar">
                <p className="eyebrow">学习路线</p>
                <h2>把区别练清楚。</h2>
                <button
                  className="adaptive-card"
                  disabled={busy || blocked}
                  onClick={() =>
                    start(
                      "practice",
                      ADAPTIVE_COURSE_IDS,
                    )
                  }
                >
                  <strong>自适应练习</strong>
                  <span>按当前掌握度继续</span>
                  <b>
                    {masteredCount(profile)} / {SKILLS.length}
                  </b>
                </button>
                <nav aria-label="练习课程">
                  {COURSES.map((c) => (
                    <button
                      key={c.id}
                      className={
                        session.courses.length === 1 &&
                        session.courses[0] === c.id
                          ? "selected"
                          : ""
                      }
                      disabled={busy || blocked}
                      onClick={() => start("practice", [c.id])}
                    >
                      {c.title}
                      <small>
                        {CARDS.filter((q) => q.courseId === c.id).length} 个场景
                      </small>
                    </button>
                  ))}
                </nav>
                <a href="#/challenge" className="challenge-card">
                  <strong>自由挑战 ↗</strong>
                  <span>多选课程，无限练习</span>
                </a>
              </aside>
            )}
            <section className="practice-main">
              <div className="round-bar">
                <span>
                  第 {session.index + 1} 题{" "}
                  {session.mode === "practice"
                    ? "/ 12"
                    : `· 已答 ${session.answered} 题`}
                </span>
                {session.mode === "practice" && (
                  <progress max={12} value={session.answered} />
                )}
                <button
                  className="text-button"
                  disabled={busy || blocked}
                  onClick={end}
                >
                  结束{session.mode === "challenge" ? "挑战" : "本轮"}
                </button>
              </div>
              <div className="mode-brief">
                <strong>{modeTitle}</strong>
                <span>
                  {COURSES.find((c) => c.id === card.courseId)?.title}
                </span>
                {session.mode === "challenge" && (
                  <button
                    className="text-button"
                    onClick={() => navigate("/challenge")}
                  >
                    更换课程
                  </button>
                )}
                <button
                  className="text-button"
                  onClick={() =>
                    commit((p) => ({
                      ...p,
                      preferences: {
                        ...p.preferences,
                        reading: !p.preferences.reading,
                      },
                    }))
                  }
                >
                  {reading ? "隐藏" : "显示"}注音
                </button>
              </div>
              <article className="exercise-card" key={session.questionId}>
                <div className="question-kicker">
                  <span>
                    {card.module === "verbs"
                      ? "自他动词"
                      : card.module === "particles"
                        ? "助词辨析"
                        : "综合辨析"}
                  </span>
                  <span>
                    {card.exerciseType === "verb-role"
                      ? "判断动词在句中的类别"
                      : session.answerMode === "choice"
                      ? "选出符合场景的表达"
                      : "填写符合场景的表达"}
                  </span>
                </div>
                <p className="scene">
                  <small>场景</small>
                  {card.scene}
                </p>
                {card.exerciseType === "verb-role" ? (
                  <>
                    <h2 className="verb-role-question">句中这个动词是自动词还是他动词？</h2>
                    <p className="contrast-title">
                      判断动词：
                      <strong><Japanese parts={card.focusVerb ? [card.focusVerb] : []} reading={reading} /></strong>
                    </p>
                  </>
                ) : card.skillId.startsWith("verb.") && (
                  <p className="contrast-title">
                    本题词对：
                    <span lang="ja">
                      {SKILL_BY_ID.get(card.skillId)?.title}
                    </span>
                  </p>
                )}
                <Sentence card={card} revealed={false} reading={reading} />
                <div className="answer-mode">
                  <span>你的答案</span>
                  <div role="group" aria-label="作答方式">
                    <button
                      disabled={!!session.result || busy}
                      className={
                        session.answerMode === "choice" ? "selected" : ""
                      }
                      onClick={() => changeAnswerMode("choice")}
                    >
                      选择
                    </button>
                    <button
                      disabled={!!session.result || busy}
                      className={
                        session.answerMode === "input" ? "selected" : ""
                      }
                      onClick={() => changeAnswerMode("input")}
                    >
                      输入
                    </button>
                  </div>
                </div>
                <form
                  onSubmit={(event: FormEvent) => {
                    event.preventDefault();
                    void submit();
                  }}
                >
                  {session.answerMode === "choice" ? (
                    <div className={`options ${card.options.length === 2 ? "two-options" : ""}`} role="group" aria-label={card.exerciseType === "verb-role" ? "动词类别" : "候选表达"}>
                      {card.options.map((o, i) => (
                        <button
                          key={o.id}
                          type="button"
                          disabled={!!session.result || busy || blocked}
                          className={`${choiceSelected?.id === o.id ? "chosen" : ""} ${session.result && card.answerIds.includes(o.id) ? "correct-option" : ""}`}
                          onClick={() => saveAnswer(o.text)}
                        >
                          {card.exerciseType === "verb-role" ? <span>{o.text}</span> : <Japanese parts={[o]} reading={reading} />}
                          <kbd>{i + 1}</kbd>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <input
                      className="answer-input"
                      ref={input}
                      aria-label={card.exerciseType === "verb-role" ? "你的自他类别答案" : "你的日语答案"}
                      lang={card.exerciseType === "verb-role" ? undefined : "ja"}
                      value={answer}
                      disabled={!!session.result || busy || blocked}
                      autoComplete="off"
                      placeholder={card.exerciseType === "verb-role" ? "输入自动词或他动词……" : "输入日语……"}
                      onChange={(e) => saveAnswer(e.target.value)}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          (e.nativeEvent.isComposing ||
                            e.nativeEvent.keyCode === 229)
                        )
                          e.preventDefault();
                      }}
                    />
                  )}
                  {!session.result && (
                    <div className="submit-row">
                      <span>
                        {card.exerciseType === "verb-role"
                          ? session.answerMode === "input"
                            ? "请填写“自动词”或“他动词”。"
                            : "按动词在句中的作用选择类别。"
                          : session.answerMode === "input"
                          ? card.skillId.startsWith("particle.")
                            ? "请填写助词的书写形式（へ／を）。"
                            : "汉字或全假名均可"
                          : "部分题目允许多个正确表达，任选其一。"}
                      </span>
                      <button
                        className="primary"
                        disabled={!answer.trim() || busy || blocked}
                        type="submit"
                      >
                        检查答案 <kbd>Enter</kbd>
                      </button>
                    </div>
                  )}
                </form>
                {!session.result && (
                  <div className="assist-row">
                    <button
                      className="text-button"
                      disabled={busy || blocked}
                      onClick={hint}
                    >
                      {session.hint ? "已使用提示" : "看一条提示"}
                    </button>
                    <button
                      className="text-button"
                      disabled={busy || blocked}
                      onClick={() => submit(true)}
                    >
                      不知道
                    </button>
                  </div>
                )}
                {session.hint && !session.result && (
                  <p className="hint-box">{card.hint}</p>
                )}
                {session.result && (
                  <div
                    className={`feedback ${session.result.correct ? "correct" : "incorrect"}`}
                    ref={feedback}
                    role="status"
                  >
                    <strong>
                      {card.exerciseType === "verb-role" && session.result.kind !== "unknown"
                        ? session.result.correct
                          ? "自他类别判断正确！"
                          : "再看看这个动词在句中的角色"
                        : session.result.correct
                        ? "与场景相符！"
                        : session.result.kind === "meaning-mismatch"
                          ? "这个表达说的是另一件事"
                          : session.result.kind === "unknown"
                            ? "暂未识别这个答案"
                            : "再看看这个区别"}
                    </strong>
                    <p>
                      {session.result.optionId
                        ? card.options.find(
                            (o) => o.id === session.result?.optionId,
                          )?.explanation
                        : session.result.kind === "unknown"
                          ? card.exerciseType === "verb-role"
                            ? "输入未匹配本题的自他类别。请填写“自动词”或“他动词”，并对照完整句中的角色。"
                            : "输入未匹配本题已审核的表达。先对照完整句，系统不会凭拼写猜测你的错因。"
                          : card.explanation}
                    </p>
                    <Sentence card={card} revealed reading={reading} />
                    <p className="translation">{card.translation}</p>
                    {card.answerIds.length > 1 && (
                      <p className="alternative">
                        本题也接受：
                        <span lang="ja">
                          {card.options
                            .filter((o) => card.answerIds.includes(o.id))
                            .map((o) => o.text)
                            .join(" / ")}
                        </span>
                      </p>
                    )}
                    <p>{card.explanation}</p>
                    <details>
                      <summary>{card.exerciseType === "verb-role" ? "查看自他类别的判断依据" : "查看其他选项的含义"}</summary>
                      {card.options.map((o) => (
                        <p key={o.id}>
                          <b lang={card.exerciseType === "verb-role" ? undefined : "ja"}>{o.text}</b> · {o.explanation}
                        </p>
                      ))}
                    </details>
                    <p className="evidence-note">
                      {session.result.independent
                        ? "已记录独立作答。"
                        : "本次作为辅助练习记录，不增加独立掌握度。"}
                      {profile.pending[targetKey(card)]
                        ? " 本目标保留待复测。"
                        : ""}
                    </p>
                    {session.mode === "challenge" &&
                      profile.pending[targetKey(card)]?.queue ===
                        "challenge" && (
                        <button
                          className="text-button"
                          onClick={() =>
                            commit((p) => ({
                              ...p,
                              pending: {
                                ...p.pending,
                                [targetKey(card)]: {
                                  ...p.pending[targetKey(card)],
                                  queue: "practice",
                                },
                              },
                            }))
                          }
                        >
                          加入常规练习复测
                        </button>
                      )}
                    <button
                      className="primary next-button"
                      disabled={busy || blocked}
                      onClick={next}
                    >
                      {session.mode === "practice" && session.answered >= 12
                        ? "查看本轮结果"
                        : "下一题"}{" "}
                      <span>
                        <kbd>Enter</kbd> →
                      </span>
                    </button>
                  </div>
                )}
              </article>
            </section>
          </div>
        )}
      </main>
      <footer className="site-footer">
        <span>文法道场 · 在场景中理解日语</span>
        <a
          href="https://l-m-sherlock.github.io/katsuyo-dojo/"
          target="_blank"
          rel="noreferrer"
        >
          活用道场 ↗
        </a>
        <a
          href="https://l-m-sherlock.github.io/kanabr/"
          target="_blank"
          rel="noreferrer"
        >
          假名练习 ↗
        </a>
      </footer>
    </div>
  );

  function SkillRow({ id }: { id: string }) {
    const skill = SKILL_BY_ID.get(id)!,
      stats = profile.bySkill[id];
    return (
      <div className="skill-row">
        <span>
          <SkillTitle id={id} />
          <small>
            {stats?.attempts
              ? `${stats.correct} / ${stats.attempts} 次独立答对 · ${stats.scenes.length} 个场景`
              : "尚未作答"}
          </small>
        </span>
        <progress value={skillProgress(skill, stats)} max={1} />
        <b>
          {mastery(skill, stats)
            ? "已达标"
            : stats?.attempts
              ? rate(skillProgress(skill, stats), 1)
              : "—"}
        </b>
      </div>
    );
  }
  function PendingList({ queue }: { queue: Mode }) {
    const rows = pending.filter((v) => v.queue === queue);
    return (
      <section className="pending-list">
        <h2>
          {queue === "challenge" ? "挑战" : "练习"}待复测{" "}
          <small>{rows.length}</small>
        </h2>
        {rows.map((v) => (
          <article key={v.key}>
            <strong>
              <SkillTitle id={v.skillId} />
            </strong>
            <p>
              换一个场景独立作答；还需穿插{" "}
              {Math.max(0, 2 - (profile.originalCount - v.lastExposureOrdinal))}{" "}
              道其他目标整题。
            </p>
            <button
              className="text-button"
              disabled={blocked}
              onClick={() =>
                commit((p) => ({
                  ...p,
                  pending: {
                    ...p.pending,
                    [v.key]: {
                      ...v,
                      queue: queue === "practice" ? "challenge" : "practice",
                    },
                  },
                }))
              }
            >
              {queue === "practice" ? "仅在挑战中复测" : "加入常规练习复测"}
            </button>
          </article>
        ))}
        {!rows.length && <p className="empty">暂无待复测目标。</p>}
      </section>
    );
  }
}
