/**
 * Doc Pawi design tokens. Colors are derived from the supplied mascot
 * (assets/images/doc-pawi-mascot.png) around the brand primary #589039.
 * Usage rules and contrast ratios are documented in docs/DESIGN_BRIEF.md.
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Brand green (shell). 500 is the brand color; use 600 behind white text (5.3:1).
        primary: {
          DEFAULT: '#589039',
          50: '#F2F8EE',
          100: '#E2F0D9',
          200: '#C6E1B4',
          300: '#A2CC86',
          400: '#7DB25C',
          500: '#589039',
          600: '#47772E',
          700: '#3A5F26',
          800: '#2F4C20',
          900: '#263E1B',
        },
        // Warm shell-edge amber: pending, scheduled, needs-review states.
        sand: {
          50: '#FDF8EE',
          100: '#FAEFD6',
          200: '#F4DCA8',
          300: '#EFCA81',
          400: '#E4AE55',
          500: '#D89536',
          600: '#B8782A',
          700: '#93591F',
        },
        // Scrubs blue: information and AI-generated content.
        ocean: {
          50: '#EEF6FB',
          100: '#D9ECF6',
          200: '#B3D8EC',
          300: '#86BEDD',
          400: '#5994B5',
          500: '#3F7A9C',
          600: '#33637F',
          700: '#284E64',
        },
        // Mouth/cross coral: errors, destructive actions, emergencies.
        coral: {
          50: '#FEF2EF',
          100: '#FDE2DB',
          200: '#FAC2B4',
          300: '#F49B85',
          400: '#EA7051',
          500: '#D4504C',
          600: '#B23B36',
          700: '#8F2E2A',
        },
        // Skin olive: subtle accents and illustrations only.
        olive: {
          100: '#F1F3D9',
          300: '#C2C268',
          500: '#8E9A3E',
        },
        ink: {
          DEFAULT: '#1B2418',
          muted: '#5C6A57',
          soft: '#8A9585',
          inverse: '#FFFFFF',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          muted: '#F6F8F4',
          sunken: '#EEF2EA',
        },
        line: {
          DEFAULT: '#E1E7DC',
          strong: '#C9D3C3',
        },
      },
      borderRadius: {
        xl: '12px',
        '2xl': '16px',
        '3xl': '24px',
      },
    },
  },
  plugins: [],
};
