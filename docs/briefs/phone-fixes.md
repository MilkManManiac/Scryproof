# Phone fixes

2026-09-26. Wes: "Layout issues are the main problems right now. Also when I'm
on my app I can't see the other servers I'm in. Check everything where it is
at now then come up with plans to make corrections."

**How this was checked.** `node scripts/phone-tour.mjs` walks 36 screens on four
phone sizes (iPhone 15, iPhone SE, Pixel 8, a narrow Galaxy) with touch and a
phone user agent, photographs each one, and measures: anything hanging off the
edge, taps smaller than 32px, text boxes that make an iPhone zoom. `python
scripts/phone-sheet.py` then puts each screen on all four phones side by side in
`.shots/phone-tour/sheets/`. It is Chrome pretending to be a phone, so anything
marked *(stylesheet)* below came from reading the CSS, not from a picture.

Decisions already made that frame this: no Apple developer fee, so the PWA *is*
the iPhone app for good; Android may later get a Capacitor build of this same
code. Every fix here lands on both.

**Status, 2026-09-26 evening: all 13 built and committed (d302bb4, e4b02c1,
1dd2d7f), not deployed.** Two things turned up while building that the first
tour missed: search results on a phone went into a drawer nothing opened, so
a search showed nothing; and a dialog opened from the drawer lived inside the
drawer. Both fixed. See docs/HANDOFF.md for the summary.

## P0: dead ends and broken basics

1. **Direct messages is a trap.** The empty DM screen has no ☰ button
   (`DirectMessages.tsx`, the `if (!dm)` branch), so after tapping @ a phone
   cannot get back to the servers. In the installed app there is no reload
   button either. This is the likeliest cause of "can't see the other
   servers". Fix: the header with `DockButton` on that screen too, and on a
   phone open the drawer on the DM list instead of the empty screen.
2. **Messages can't be touched.** React, reply, edit, delete and save live in
   `.message-actions`, shown only on `:hover`. A phone has no hover, so none
   of them are reachable. Fix: long-press a message for a bottom sheet with
   those actions.
3. **The message box is squeezed.** The `# general` chip, +, emoji, Meepo,
   mic and send leave the text box about 80px on the narrow Galaxy: "anyo /
   ne on / tonig / ht". The B I S <> bar takes another row. Fix: on a phone
   drop the chip, fold formatting into the + menu, text box full width.
4. **iPhone zooms in on every text box.** Inputs are 13 to 15px. iOS zooms the
   page on focus under 16px and does not zoom back out, which is what "the
   layout goes weird after I type" usually is. Fix: 16px on phones, one rule.
5. **The notch and the home bar** *(stylesheet)*. `index.html` sets
   `viewport-fit=cover` and a translucent status bar, but the CSS never uses
   `env(safe-area-inset-*)`. In the installed iPhone app the header and the
   top of the drawer sit under the clock and the message box under the home
   bar. Fix: safe-area padding on the header, drawers, message box and call
   controls.

## P1: screens built for a desktop, squeezed

6. **Server and channel settings** keep the desktop two-column layout: the
   menu takes 40% of the width and the page is cut off on the right (Delete
   button, the role tabs, the colour swatches, the confirm box). The tour's
   edge check missed these because the cut happens inside a scrolling box;
   the pictures show it. Fix: on a phone the menu is its own screen; tap an
   item for a full-width page with a back arrow.
7. **Voice call.** The hang-up button is cut off on the small phones, the
   connection panel wraps into three-line columns, and the soundboard opens
   as a thin strip with its add button cut to "Ad". Fix: controls shrink to
   fit, the panel in two rows, the soundboard as a bottom sheet.
8. **Search** squeezes the header: "4 members" prints over the channel name
   and the icons get pushed off. Fix: on a phone search takes the whole
   header, with a back arrow.
9. **Thumb-sized taps.** 20 to 35 controls per screen are under 32px: header
   icons 30px, drawer icons 22 to 26px, channel rows 30px. Apple asks 44,
   Google 48. Fix: 44px on phones.

## P2: behave like a phone app

10. **Swipe** from the left edge for servers and channels, from the right for
    members, the way Discord does it.
11. **Android back button** closes the open drawer or dialog instead of
    leaving the app.
12. Dialogs opened from the drawer leave the drawer open behind them.
13. Words written for a mouse: "click", "on the left", "hover".

## Found in the final tour, not fixed

- **New-device warnings stack.** A DM shows one full "You signed in somewhere
  new" card per unaccepted device, about 180px each on a phone. The tour signs
  in fresh every screen, so the seed account has dozens and the conversation
  is buried; for a real person two or three already fill the screen. Fix: one
  card, "3 new devices", that opens the list.

## Not covered yet

- Safari's own engine: WebKit is installed under `.tools/webkit` for the next
  pass, which will photograph the iPhone sizes in Safari's engine rather than
  Chrome's.
- The on-screen keyboard pushing the message box, and pull-to-refresh. These
  need a real phone.
- "The update function": not looked at yet. Waiting on Wes to say what went
  wrong.
