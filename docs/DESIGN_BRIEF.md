# Doc Pawi — Design Brief

> **Document role:** visual identity, UX principles, component conventions, and screen expectations.
> Related: [App Flow](APP_FLOW.md) · [PRD](PRD.md) · [Technical Requirements](TECHNICAL_REQUIREMENTS.md)

## 1. Brand

| Item | Value |
|---|---|
| Name | Doc Pawi — AI Medical Assistant ("pawi" evokes relief in Filipino, as in *pampawi*) |
| Mascot | [`assets/images/doc-pawi-mascot.png`](../assets/images/doc-pawi-mascot.png): a pixel-art sea turtle in a white coat with a stethoscope |
| Primary color | `#589039` |
| Platform | Android first |

**Mascot handling.** The supplied file ([`assets/source/doc-pawi-mascot-original.png`](../assets/source/doc-pawi-mascot-original.png)) had a checkerboard "transparency" pattern baked into its pixels. The background was removed with a border-connected flood fill (the pixel-art outline keeps the white coat intact) and the artwork was trimmed; no pixels of the character were redrawn or replaced. The launcher icon, adaptive icon (foreground/background/monochrome), splash image, notification icon, and favicon are generated from that cleaned mascot.

## 2. Palette (derived from the mascot)

Colors sampled from the artwork: shell green `#3F7733`, shell edge sand `#EFCA81`, skin olive `#C2C268`, scrubs blue `#5994B5`, mouth/cross coral `#EA7051`/`#D4504C`. They are organized as Tailwind tokens in [`tailwind.config.js`](../tailwind.config.js) (raw values for icons in [`src/theme/colors.ts`](../src/theme/colors.ts)).

| Token | Value | Use | Contrast note |
|---|---|---|---|
| `primary-500` | `#589039` | Brand color: progress, active states, mascot surfaces, toggles | 3.8:1 on white → large text/graphics only |
| `primary-600` | `#47772E` | Filled primary buttons (white text) | 5.3:1 with white ✓ AA |
| `primary-700` | `#3A5F26` | Links, success text on `primary-50` | 6.9:1 on `primary-50` ✓ |
| `sand-*` | `#FDF8EE` … `#93591F` | Pending / scheduled / needs review / AI suggestion cards | `sand-700` on `sand-50` 5.4:1 ✓ |
| `ocean-*` | `#EEF6FB` … `#284E64` | Information and AI-generated content | `ocean-600` on `ocean-50` ≈5.9:1 ✓ |
| `coral-*` | `#FEF2EF` … `#8F2E2A` | Errors, destructive actions, emergencies | `coral-600` on white 5.9:1 ✓; white on `coral-600` 5.9:1 ✓ |
| `olive-*` | `#F1F3D9` … `#8E9A3E` | Demo-data badges, subtle accents | — |
| `ink` / `ink-muted` / `ink-soft` | `#1B2418` / `#5C6A57` / `#8A9585` | Text / secondary text / placeholders, timestamps | `ink-muted` 5.7:1 on white ✓ |
| `surface` / `surface-muted` / `surface-sunken` | `#FFFFFF` / `#F6F8F4` / `#EEF2EA` | Cards / screen background / wells | — |
| `line` / `line-strong` | `#E1E7DC` / `#C9D3C3` | Borders / input borders | — |

Status semantics (used by `StatusBadge` and `Banner`):

| State | Tone | Example |
|---|---|---|
| Completed / saved / ready | success (green) | "Taken", "Saved after your confirmation", "Ready on device" |
| Pending / scheduled / verify | pending (sand) | "Due — not recorded", "AI suggestion — not saved", "Verify" |
| Failed / destructive / emergency | danger (coral) | "Failed", "Delete", "Possible emergency" |
| Unavailable / neutral | neutral (grey) | "Not installed", "Skipped", "Rejected — nothing saved" |
| AI / information | info / ai (blue) | "Doc" badge, AI summary card |
| Synthetic data | demo (olive) | "Demo" |

## 3. Visual direction

Friendly, calm healthcare: soft green-tinted neutral background, white rounded cards (`rounded-2xl`, 1 px borders instead of heavy shadows), restrained accent color, generous spacing (`p-4`, `gap-4`), clear hierarchy (bold titles, uppercase section headers, muted metadata), and the mascot only where it adds warmth (welcome, unlock, home, empty chat). No gradients or decorative noise. Medical values are shown large (`text-lg font-bold`) and selectable.

## 4. Styling system

NativeWind **4.2.7** + Tailwind CSS **3.4** (v5 is a pre-release and was not adopted).

| File | Purpose |
|---|---|
| `babel.config.js` | `babel-preset-expo` with `jsxImportSource: "nativewind"` + `nativewind/babel` (the worklets plugin is already added by `babel-preset-expo`) |
| `metro.config.js` | `withNativeWind(config, { input: './src/global.css' })` |
| `tailwind.config.js` | `nativewind/preset`, `content: ./src/**/*`, Doc Pawi tokens |
| `src/global.css` | `@tailwind base/components/utilities`, imported once in `src/app/_layout.tsx` |
| `nativewind-env.d.ts` | `className` typings |

Rules
- Use native components (`View`, `Text`, `Pressable`, `TextInput`, `ScrollView`) with `className`; pressed states use `active:` classes. **Never** pass a function to `style` on `Pressable` (NativeWind v4 drops it).
- Avoid toggling shadow/transform classes after first render (a NativeWind v4 dev-mode crash); cards use borders.
- Inline `style` is used only for computed values (progress width, image size).
- Flexbox only; no web-only CSS.

Shared components ([`src/components/ui`](../src/components/ui)):

| Component | Notes |
|---|---|
| `Button`, `IconButton` | Variants primary/secondary/outline/ghost/danger; sizes sm/md/lg; ≥ 40–56 dp height; loading + disabled states; accessible labels |
| `Card` | Optional pressable card |
| `TextField`, `DateField` (`YYYY-MM-DD` + quick picks), `TimeField` (`HH:MM`) | Label, hint, required marker, inline error (live region) |
| `ChoiceChips`, `SegmentedTabs`, `ToggleRow` | Radio-group / tab / switch semantics |
| `SectionHeader`, `ListItem`, `KeyValueRow`, `ProgressBar` | Lists and details |
| `StatusBadge`, `Banner` | Tone-based status and messages |
| `EmptyState`, `LoadingState`, `ErrorState` | Consistent empty/loading/error presentation |
| `ConfirmDialog` | Modal confirmation; destructive variant can require typing DELETE |
| `PinPad`, `PinDots` | Custom keypad (PIN never goes through the system keyboard) |
| `Mascot`, `Screen` | Mascot image with description; safe-area + keyboard-avoiding scroll container |
| Feature components | `DoseRow`, `TreatmentCard`, `ProposalCard`, `MessageBubble`, `ModelStatusCard`, `AvatarMenu`, `MapHandoffButton` |

The **Style check** screen (Settings → Style check, route `/dev/style-check`) renders raw `View`/`Text`/`Pressable`/`ScrollView` with utilities and the brand color to verify NativeWind on a native Android build.

## 5. Screen specifications

| Screen | Layout and interaction |
|---|---|
| Welcome | Mascot, name, tagline, privacy promise; profile list for returning users; Get started; disclaimer line |
| Onboarding (7 steps) | Step x of 7 + progress bar, title, explanation, content, sticky footer actions; skip on optional steps |
| Unlock | Mascot, greeting with first name, PIN dots + keypad, biometric key when enabled, lockout banner with countdown, switch profile, forgot-PIN explanation |
| Home | Mascot card with date, greeting, name, data-driven message; quick actions (Ask, Import); model status; today's doses with Taken/Skipped; ongoing treatments; upcoming/overdue events; activity tiles |
| Chats | New conversation; model status; conversation list with preview, time, count, delete |
| Conversation | Message list (user right/green, assistant left/white), sources disclosure, model + speed footer, proposal cards, emergency banners; composer with attach, send/stop |
| Records | Tabs: Records (search + category chips), Vaccinations, Treatments, Documents; add/import actions |
| Record detail | Title, provenance badge, key fields, lab results table with document flags, provenance section, edit/delete |
| Document review | File info + encrypted storage note, preview (images), job progress with elapsed time, AI summary card, editable proposal with Found/Verify labels, recognized text, delete |
| Meds | Add; permission banner; tabs Today / Active / Archived / History |
| Doctors / HMO | Search/list, detail with call/email/map hand-off, user-reported HMO links/facilities |
| Profile | Read view + edit form (units chosen by the user) |
| Settings | AI model, security (PIN, biometrics, idle lock), reminders, demo data, privacy & info, account & data (distinct sign out / delete conversations / delete vault) |
| AI model | Offline banner, model cards (size, quantization, license, source commit, SHA-256, status, actions), engine info, test prompt with tokens/s, device info |

## 6. Accessibility

- Every interactive element has an `accessibilityRole` and label; icons are hidden from screen readers.
- Touch targets ≥ 44 dp (icon buttons, chips, list rows, keypad keys 64 dp).
- Text contrast meets WCAG AA (see palette); brand green behind white text is avoided in favor of `primary-600`.
- Errors are inline, descriptive, and announced (`accessibilityLiveRegion`); emergencies use `accessibilityRole="alert"`.
- Destructive actions always confirm; irreversible ones require typing DELETE.
- Layouts are tested at 360 × 806 dp (720 × 1612 px, density 2.0); content scrolls and wraps; keyboard-avoiding containers on forms; the composer stays above the keyboard.
- Medical values are large and selectable for copying.
