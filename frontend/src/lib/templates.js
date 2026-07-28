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
