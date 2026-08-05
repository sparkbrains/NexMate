export const PAPER_STYLES = {
  bullet: {
    backgroundColor: '#fbfaf8',
    backgroundImage: 'radial-gradient(#c8c8c8 1px, transparent 1px)',
    backgroundSize: '24px 24px',
    backgroundPosition: '0 0',
    color: '#2d3436',
  },
  coffee: {
    backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.5), rgba(255, 255, 255, 0.5)), url("https://images.unsplash.com/photo-1586075010923-2dd4570fb338?auto=format&fit=crop&w=1200&q=80")',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    color: '#1a1a1a',
  },
  lined: {
    backgroundColor: '#fbfaf8',
    backgroundImage: 'repeating-linear-gradient(transparent, transparent 31px, #e2e2e2 31px, #e2e2e2 32px)',
    backgroundSize: '100% 32px',
    backgroundPosition: '0 8px',
    color: '#2d3436',
  },
};

const framedTheme = (file) => ({
  backgroundImage: `url("/themes/${file}"), url("/themes/${file}")`,
  backgroundSize: 'contain, cover',
  backgroundPosition: 'center, center',
  backgroundRepeat: 'no-repeat, no-repeat',
  color: '#1a1a1a',
});

PAPER_STYLES.newspaper = framedTheme('theme-newspaper.jpg');
PAPER_STYLES.tulips = framedTheme('theme-tulips.jpg');
PAPER_STYLES['blue-floral'] = framedTheme('theme-blue-floral.jpg');
PAPER_STYLES['blue-paper'] = framedTheme('theme-blue-paper.jpg');
PAPER_STYLES.aesthetic = framedTheme('theme-aesthetic.jpg');
PAPER_STYLES.pastel = framedTheme('theme-pastel.jpg');
PAPER_STYLES['vintage-aesthetic'] = framedTheme('theme-vintage-aesthetic.jpg');
PAPER_STYLES.minimal = framedTheme('theme-minimal.jpg');
PAPER_STYLES['grid-paper'] = framedTheme('theme-grid-paper.jpg');
PAPER_STYLES.moon = framedTheme('theme-moon.jpg');

export const TEMPLATE_CATEGORIES = [
  {
    id: 'getting-started',
    title: 'GETTING STARTED',
    description: 'Templates are a great way to add structure and consistency to your entries.',
    templates: [
      {
        id: 'daily-gratitude',
        title: 'Daily Gratitude',
        icon: '☀️',
        html: `
          <div style="font-family: var(--font-serif); color: var(--ink);">
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-3); margin-bottom: 8px; background: var(--surface-2); display: inline-block; padding: 2px 6px; border-radius: 4px;">TODAY I AM GRATEFUL FOR:</div>
            <ul>
              <li><br></li>
              <li><br></li>
              <li><br></li>
            </ul>
            <br>
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-3); margin-bottom: 8px; background: var(--surface-2); display: inline-block; padding: 2px 6px; border-radius: 4px;">SIMPLE DELIGHTS I HAVE ENJOYED LATELY:</div>
            <ul>
              <li><br></li>
              <li><br></li>
            </ul>
            <br>
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-3); margin-bottom: 8px; background: var(--surface-2); display: inline-block; padding: 2px 6px; border-radius: 4px;">3 GOOD THINGS THAT HAPPENED TODAY:</div>
            <ol>
              <li><br></li>
              <li><br></li>
              <li><br></li>
            </ol>
            <br>
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-3); margin-bottom: 8px; background: var(--surface-2); display: inline-block; padding: 2px 6px; border-radius: 4px;">MY FAVORITE MOMENTS OF THE DAY:</div>
            <ul>
              <li><br></li>
            </ul>
          </div>
        `,
      },
      {
        id: '5-minutes-am',
        title: '5 minutes A.M.',
        icon: '🌅',
        html: `
          <div style="font-family: var(--font-serif); color: var(--ink);">
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-3); margin-bottom: 8px; background: var(--surface-2); display: inline-block; padding: 2px 6px; border-radius: 4px;">I AM GRATEFUL FOR...</div>
            <ol>
              <li><br></li>
              <li><br></li>
              <li><br></li>
            </ol>
            <br>
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-3); margin-bottom: 8px; background: var(--surface-2); display: inline-block; padding: 2px 6px; border-radius: 4px;">WHAT WOULD MAKE TODAY GREAT?</div>
            <ol>
              <li><br></li>
              <li><br></li>
              <li><br></li>
            </ol>
            <br>
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-3); margin-bottom: 8px; background: var(--surface-2); display: inline-block; padding: 2px 6px; border-radius: 4px;">DAILY AFFIRMATION. I AM...</div>
            <ul>
              <li><br></li>
            </ul>
          </div>
        `,
      },
    ]
  },
  {
    id: 'reflections',
    title: 'REFLECTIONS',
    description: 'Explore your thoughts and emotions through introspection.',
    templates: [
      {
        id: 'morning',
        title: 'Morning',
        icon: '🌞',
        html: `
          <div style="font-family: var(--font-serif); color: var(--ink);">
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-3); margin-bottom: 8px; background: var(--surface-2); display: inline-block; padding: 2px 6px; border-radius: 4px;">INTENTION FOR TODAY:</div>
            <p><br></p>
            <br>
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-3); margin-bottom: 8px; background: var(--surface-2); display: inline-block; padding: 2px 6px; border-radius: 4px;">SOMETHING I'M LOOKING FORWARD TO:</div>
            <p><br></p>
          </div>
        `
      },
      {
        id: 'evening',
        title: 'Evening',
        icon: '🌙',
        html: `
          <div style="font-family: var(--font-serif); color: var(--ink);">
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-3); margin-bottom: 8px; background: var(--surface-2); display: inline-block; padding: 2px 6px; border-radius: 4px;">HIGHLIGHTS OF TODAY:</div>
            <ul>
              <li><br></li>
            </ul>
            <br>
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-3); margin-bottom: 8px; background: var(--surface-2); display: inline-block; padding: 2px 6px; border-radius: 4px;">WHAT I LEARNED TODAY:</div>
            <p><br></p>
          </div>
        `
      }
    ]
  },
  {
    id: 'productivity',
    title: 'PRODUCTIVITY',
    description: 'Maximize your efficiency and prioritize your tasks and notes.',
    templates: [
      {
        id: 'daily-plan',
        title: 'Daily Plan',
        icon: '📋',
        html: `
          <div style="font-family: var(--font-serif); color: var(--ink);">
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-3); margin-bottom: 8px; background: var(--surface-2); display: inline-block; padding: 2px 6px; border-radius: 4px;">TOP PRIORITIES:</div>
            <ol>
              <li><br></li>
              <li><br></li>
              <li><br></li>
            </ol>
            <br>
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-3); margin-bottom: 8px; background: var(--surface-2); display: inline-block; padding: 2px 6px; border-radius: 4px;">OTHER TASKS:</div>
            <ul>
              <li><br></li>
              <li><br></li>
            </ul>
          </div>
        `
      },
      {
        id: 'decision-making',
        title: 'Decision Making',
        icon: '⚖️',
        html: `
          <div style="font-family: var(--font-serif); color: var(--ink);">
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-3); margin-bottom: 8px; background: var(--surface-2); display: inline-block; padding: 2px 6px; border-radius: 4px;">THE DECISION TO BE MADE:</div>
            <p><br></p>
            <br>
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-3); margin-bottom: 8px; background: var(--surface-2); display: inline-block; padding: 2px 6px; border-radius: 4px;">PROS:</div>
            <ul>
              <li><br></li>
            </ul>
            <br>
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-3); margin-bottom: 8px; background: var(--surface-2); display: inline-block; padding: 2px 6px; border-radius: 4px;">CONS:</div>
            <ul>
              <li><br></li>
            </ul>
            <br>
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-3); margin-bottom: 8px; background: var(--surface-2); display: inline-block; padding: 2px 6px; border-radius: 4px;">POSSIBLE OUTCOMES:</div>
            <p><br></p>
          </div>
        `
      }
    ]
  }
];
