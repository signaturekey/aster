import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  MotionConfig,
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";
import { LANDING_MOTION as M } from "@web/pages/landing/landing-motion";
import { Icon } from "@web/shared/ui/icon";
import "@web/pages/landing/landing.css";

function Wordmark() {
  return (
    <Link to="/" className="brand" aria-label="Aster — на главную">
      aster
      <span className="brand-dot" aria-hidden="true">
        .
      </span>
    </Link>
  );
}
function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ ...M.reveal, delay }}
    >
      {children}
    </motion.div>
  );
}
function Spark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M50 3v94M3 50h94M17 17l66 66M17 83l66-66"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}
function HeroScene() {
  const reduced = useReducedMotion();
  const scene = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: scene,
    offset: ["start start", "end start"],
  });
  const drift = useTransform(scrollYProgress, [0, 1], [0, M.heroDrift]);
  const turn = useTransform(scrollYProgress, [0, 1], [0, -5]);
  return (
    <div
      className="landing-scene"
      ref={scene}
      aria-label="Вымышленные примеры человека, идеи и общего интереса"
    >
      <div className="landing-orbit orbit-one" aria-hidden="true" />
      <div className="landing-orbit orbit-two" aria-hidden="true" />
      <motion.div
        className="landing-scene-depth"
        style={reduced ? {} : { y: drift, rotate: turn }}
      >
        <motion.div
          className="landing-art-card landing-idea"
          initial={reduced ? false : { x: -80, y: 60, rotate: -20, opacity: 0 }}
          animate={
            reduced ? { opacity: 1 } : { x: 0, y: 0, rotate: -12, opacity: 1 }
          }
          transition={{ ...M.assemble, delay: 0.15 }}
        >
          <span className="art-card-index">01 / ЕСТЬ ИДЕЯ</span>
          <div className="idea-drawing" aria-hidden="true">
            <svg viewBox="0 0 180 130" fill="none">
              <ellipse
                cx="90"
                cy="65"
                rx="74"
                ry="27"
                transform="rotate(-35 90 65)"
              />
              <ellipse
                cx="90"
                cy="65"
                rx="74"
                ry="27"
                transform="rotate(35 90 65)"
              />
              <circle
                cx="90"
                cy="65"
                r="12"
                fill="currentColor"
                stroke="none"
              />
              <path d="M15 20h13m-6.5-6.5v13M150 108h13m-6.5-6.5v13" />
            </svg>
          </div>
          <h3>
            А если
            <br />
            попробовать?
          </h3>
          <span className="art-card-bottom">
            Маленький проект. Большой интерес.
          </span>
        </motion.div>
        <motion.div
          className="landing-art-card landing-person"
          initial={reduced ? false : { x: 90, y: 80, rotate: 18, opacity: 0 }}
          animate={
            reduced ? { opacity: 1 } : { x: 0, y: 0, rotate: 8, opacity: 1 }
          }
          transition={{ ...M.assemble, delay: 0.3 }}
        >
          <div className="person-art-top">
            <span>ЧЕЛОВЕК, А НЕ РЕЗЮМЕ</span>
            <span aria-hidden="true">↗</span>
          </div>
          <div className="landing-person-avatar" aria-hidden="true">
            МЛ
            <span />
          </div>
          <h3>Марк Лебедев</h3>
          <p>
            Backend-разработчик.
            <br />
            Любопытство — full-stack.
          </p>
          <div className="landing-art-tags">
            <span>Go</span>
            <span>Свой проект</span>
            <span>Давай вместе</span>
          </div>
          <div className="person-art-footer">
            <span className="person-art-dot" />
            Открыт к общим идеям
          </div>
        </motion.div>
        <motion.div
          className="landing-art-note"
          initial={reduced ? false : { y: 25, scale: 0.85, opacity: 0 }}
          animate={{ y: 0, scale: 1, opacity: 1 }}
          transition={{ ...M.assemble, delay: 0.65 }}
        >
          <span className="note-spark" aria-hidden="true">
            ✳
          </span>
          <div>
            <strong>Есть что-то общее.</strong>
            <span>С этого и начнём.</span>
          </div>
        </motion.div>
        <motion.div
          className="scene-spark"
          initial={reduced ? false : { rotate: -80, opacity: 0 }}
          animate={{ rotate: 0, opacity: 1 }}
          transition={{ ...M.reveal, delay: 0.5 }}
        >
          <Spark />
        </motion.div>
      </motion.div>
      <span className="scene-footnote">ИЛЛЮСТРАЦИЯ · ВЫМЫШЛЕННЫЙ ПЕРСОНАЖ</span>
    </div>
  );
}
function Journey() {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 80%", "end 25%"],
  });
  const leftX = useTransform(
    scrollYProgress,
    [0, M.storyProgressEnd],
    [-M.storyTravel, 0],
  );
  const rightX = useTransform(
    scrollYProgress,
    [0, M.storyProgressEnd],
    [M.storyTravel, 0],
  );
  const leftRotate = useTransform(
    scrollYProgress,
    [0, M.storyProgressEnd],
    [-13, -5],
  );
  const rightRotate = useTransform(
    scrollYProgress,
    [0, M.storyProgressEnd],
    [13, 5],
  );
  const connectionScale = useTransform(
    scrollYProgress,
    [0.25, M.storyProgressEnd],
    [0.3, 1],
  );
  return (
    <section
      className="landing-journey"
      id="how-it-works"
      ref={ref}
      aria-labelledby="journey-heading"
    >
      <div className="landing-section-heading">
        <Reveal>
          <p className="landing-kicker">01 / ОТ ЗНАКОМСТВА К ОБЩЕМУ ДЕЛУ</p>
          <h2 id="journey-heading">
            Не искать идеальных.
            <br />
            <em>Найти своих.</em>
          </h2>
        </Reveal>
        <Reveal>
          <p className="landing-section-copy">
            Навыки важны. Но иногда всё решает одно:
            <br className="landing-desktop-break" /> «Мне тоже это интересно».
          </p>
        </Reveal>
      </div>
      <div className="journey-art" aria-hidden="true">
        <div className="journey-rule" />
        <motion.div
          className="journey-profile journey-profile-left"
          style={reduced ? {} : { x: leftX, rotate: leftRotate }}
        >
          <div className="journey-avatar clay">СМ</div>
          <strong>Есть задумка.</strong>
          <span>Могу сделать интерфейс</span>
          <div className="journey-tag">React · Дизайн · Любопытство</div>
        </motion.div>
        <motion.div
          className="journey-connection"
          style={reduced ? {} : { scale: connectionScale }}
        >
          <Spark />
          <span>
            общий
            <br />
            интерес
          </span>
        </motion.div>
        <motion.div
          className="journey-profile journey-profile-right"
          style={reduced ? {} : { x: rightX, rotate: rightRotate }}
        >
          <div className="journey-avatar sage">МЛ</div>
          <strong>Давай соберём.</strong>
          <span>Могу помочь с backend</span>
          <div className="journey-tag">Go · Архитектура · Идеи</div>
        </motion.div>
      </div>
      <div className="journey-steps">
        {[
          {
            number: "01",
            title: "Расскажите о себе",
            text: "Не список достижений. Навыки, интересы и то, что хочется попробовать.",
          },
          {
            number: "02",
            title: "Найдите общий интерес",
            text: "Знакомьтесь с людьми. Если интерес взаимный — начинайте разговор.",
          },
          {
            number: "03",
            title: "Сделайте первый шаг",
            text: "Обсудите идею, соберите команду. Для проекта — заявка и решение автора.",
          },
        ].map((step, i) => (
          <Reveal
            key={step.number}
            delay={i * M.staggerSeconds}
            className="journey-step"
          >
            <span>{step.number}</span>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
// Editorial illustrations belong to the landing, not to API-backed project state.
// Their local keys must never become project-detail URLs or product fixture IDs.
const IDEAS = [
  {
    id: "atlas",
    name: "Атлас",
    format: "Пет-проект",
    role: "Заметки, которые находят связи.",
    text: "Собираем спокойное пространство для идей и маленьких открытий.",
    tone: "clay",
    mark: "◎",
    tags: ["React", "TypeScript"],
  },
  {
    id: "root",
    name: "Корни",
    format: "Хакатон",
    role: "Маленькие дела. Живой город.",
    text: "Помогаем локальным инициативам находить людей, которым не всё равно.",
    tone: "sage",
    mark: "⌁",
    tags: ["Community", "Go"],
  },
  {
    id: "most",
    name: "Мост",
    format: "Стартап",
    role: "Первый шаг проще вместе.",
    text: "Обмен знаниями через короткие встречи, а не ещё один список закладок.",
    tone: "blue",
    mark: "↗",
    tags: ["EdTech", "React"],
  },
];
export function LandingPage() {
  const reduced = useReducedMotion();
  useEffect(() => {
    document.title = "Aster — Хорошие идеи ищут своих";
    window.scrollTo(0, 0);
  }, []);
  return (
    <MotionConfig reducedMotion="user">
      <div className={`landing ${reduced ? "landing-reduced" : ""}`}>
        <a className="skip-link" href="#landing-main">
          К содержимому
        </a>
        <header className="landing-header">
          <div className="landing-header-inner">
            <Wordmark />
            <nav aria-label="Навигация лендинга">
              <a href="#how-it-works">Как это работает</a>
              <a href="#ideas">Для ваших идей</a>
            </nav>
            <div className="landing-header-actions">
              <Link to="/sign-in" className="landing-login">
                Войти
              </Link>
              <Link to="/sign-up" className="button primary">
                Найти своих <Icon name="arrow" size={15} />
              </Link>
            </div>
          </div>
        </header>
        <main id="landing-main" tabIndex={-1}>
          <section className="landing-hero" aria-labelledby="landing-title">
            <div className="landing-hero-copy">
              <motion.p
                className="landing-kicker"
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
              >
                ЛЮДИ. ИДЕИ. ТО, ЧТО МЕЖДУ НИМИ.
              </motion.p>
              <h1 id="landing-title">
                <motion.span
                  initial={reduced ? false : { opacity: 0, y: 28 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={M.reveal}
                >
                  Хорошие идеи{" "}
                </motion.span>
                <motion.span
                  initial={reduced ? false : { opacity: 0, y: 28 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...M.reveal, delay: 0.1 }}
                >
                  ищут <em>своих.</em>
                </motion.span>
              </h1>
              <motion.div
                initial={reduced ? false : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...M.reveal, delay: 0.2 }}
              >
                <p className="landing-hero-description">
                  Возможно, вашему следующему проекту
                  <br className="landing-desktop-break" /> не хватает не
                  времени. А человека.
                </p>
                <div className="landing-hero-actions">
                  <Link className="button primary" to="/discover">
                    Найти своих <Icon name="arrow" size={17} />
                  </Link>
                  <a className="landing-secondary-link" href="#how-it-works">
                    Сначала познакомимся <span aria-hidden="true">↓</span>
                  </a>
                </div>
                <p className="landing-entry-caption">
                  Знакомства и проекты доступны после входа
                </p>
              </motion.div>
            </div>
            <HeroScene />
            <div className="landing-hero-bottom">
              <span>СОБРАТЬСЯ, ЧТОБЫ СДЕЛАТЬ ЧТО-ТО СВОЁ</span>
              <a href="#how-it-works" aria-label="Узнать, как работает Aster">
                <span>Листайте дальше</span>
                <span className="landing-scroll-arrow" aria-hidden="true">
                  ↓
                </span>
              </a>
            </div>
          </section>
          <section
            className="landing-statement"
            aria-labelledby="statement-heading"
          >
            <Reveal>
              <span className="landing-statement-mark" aria-hidden="true">
                ↗
              </span>
              <h2 id="statement-heading">
                Большое редко начинается с большого.
                <br />
                <span>Чаще — с маленького</span> <em>«давай».</em>
              </h2>
            </Reveal>
            <Reveal delay={0.1}>
              <p>
                У вас может быть идея без команды.
                <br />
                Или навыки, которым пока не нашлось общей идеи.
                <br />
                <strong>Aster помогает этим историям встретиться.</strong>
              </p>
            </Reveal>
          </section>
          <Journey />
          <section
            className="landing-ideas"
            id="ideas"
            aria-labelledby="ideas-heading"
          >
            <div className="landing-section-heading">
              <Reveal>
                <p className="landing-kicker">02 / ЕСТЬ ПОВОД СОБРАТЬСЯ</p>
                <h2 id="ideas-heading">
                  Не обязательно
                  <br />
                  менять мир. <em>Начните.</em>
                </h2>
              </Reveal>
              <Reveal>
                <p className="landing-section-copy">
                  Свой продукт, вечерний эксперимент
                  <br />
                  или хакатон на выходных. Выберите своё.
                </p>
                <Link className="landing-inline-link" to="/projects">
                  Посмотреть проекты <Icon name="arrow" size={16} />
                </Link>
              </Reveal>
            </div>
            <div className="landing-idea-grid">
              {IDEAS.map((idea, i) => (
                <Reveal key={idea.id} delay={i * M.staggerSeconds}>
                  <article
                    className={`landing-project ${idea.tone}`}
                    aria-describedby="landing-illustration-note"
                  >
                    <div className="landing-project-art">
                      <span className="landing-project-format">
                        {idea.format}
                      </span>
                      <span className="landing-project-mark" aria-hidden="true">
                        {idea.mark}
                      </span>
                      <span className="landing-project-example">
                        ПРИМЕР ИДЕИ
                      </span>
                    </div>
                    <div className="landing-project-content">
                      <div className="landing-project-title">
                        <h3>{idea.name}</h3>
                        <Icon name="arrow" size={19} />
                      </div>
                      <h4>{idea.role}</h4>
                      <p>{idea.text}</p>
                      <div className="landing-project-tags">
                        {idea.tags.map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                      </div>
                    </div>
                  </article>
                </Reveal>
              ))}
            </div>
            <p
              className="landing-illustration-note"
              id="landing-illustration-note"
            >
              Вымышленные идеи для иллюстрации. Это не проекты и не активность
              участников Aster.
            </p>
          </section>
          <section
            className="landing-together"
            aria-labelledby="together-heading"
          >
            <div className="together-copy">
              <Reveal>
                <p className="landing-kicker">03 / БОЛЬШЕ, ЧЕМ СОВПАДЕНИЕ</p>
                <h2 id="together-heading">
                  Сначала — «привет».
                  <br />
                  Потом — <em>«а что, если?»</em>
                </h2>
                <p>
                  Общий интерес становится разговором.
                  <br />
                  Разговор — первым шагом.
                  <br />А дальше историю пишете вы.
                </p>
                <Link to="/discover" className="button secondary">
                  Познакомиться с людьми <Icon name="arrow" size={16} />
                </Link>
              </Reveal>
            </div>
            <Reveal className="landing-conversation">
              <div className="conversation-example-label">
                КАК МОЖЕТ НАЧАТЬСЯ ЗНАКОМСТВО · ПРИМЕР
              </div>
              <div className="conversation-person">
                <span>СМ</span>
                <div>
                  <strong>Саша</strong>
                  <small>Есть идея</small>
                </div>
                <Icon name="match" size={20} />
                <span>МЛ</span>
              </div>
              <motion.div
                className="landing-chat-bubble chat-first"
                initial={reduced ? false : { opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ ...M.reveal, delay: 0.1 }}
              >
                Привет! А если собрать место,
                <br />
                где идеи находят людей?
              </motion.div>
              <motion.div
                className="landing-chat-bubble chat-second"
                initial={reduced ? false : { opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ ...M.reveal, delay: 0.25 }}
              >
                Мне нравится. Я бы попробовал.
              </motion.div>
              <motion.div
                className="landing-chat-bubble chat-third"
                initial={reduced ? false : { opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ ...M.reveal, delay: 0.4 }}
              >
                Давай начнём с маленького ↗
              </motion.div>
              <div className="conversation-footnote">
                Не настоящая переписка. Просто возможное начало.
              </div>
            </Reveal>
          </section>
          <section className="landing-final" aria-labelledby="final-heading">
            <Reveal>
              <Spark className="landing-final-spark" />
              <p className="landing-kicker">ВАШЕ СЛЕДУЮЩЕЕ НАЧАЛО</p>
              <h2 id="final-heading">
                Не хватает
                <br />
                <em>только вас.</em>
              </h2>
              <p>
                Не идеального момента. Не идеального плана.
                <br />
                Человека, которому тоже интересно.
              </p>
              <Link className="button primary" to="/sign-up">
                Давайте знакомиться <Icon name="arrow" size={18} />
              </Link>
              <Link className="landing-final-link" to="/discover">
                Перейти к подборке людей ↗
              </Link>
            </Reveal>
          </section>
        </main>
        <footer className="landing-footer">
          <div>
            <Wordmark />
            <p>Люди, с которыми хочется начать.</p>
          </div>
          <div className="landing-footer-links">
            <a href="#how-it-works">Как это работает</a>
            <Link to="/projects">Проекты</Link>
            <Link to="/sign-in">Войти</Link>
          </div>
          <div className="landing-footer-note">
            <span>Иллюстрации — не активность сервиса.</span>
            <span>Персонажи, идеи и переписка вымышлены.</span>
            <span>ASTER / IDEAS IN THE MAKING</span>
          </div>
        </footer>
      </div>
    </MotionConfig>
  );
}
