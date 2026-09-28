/**
 * The Guide (`lib/guide.ts`): the long answer, where the walkthrough is the
 * one-minute tour. Four tabs, plain words.
 *
 * Every sentence here has to stay true. The sources: `NotifySettings.tsx` and
 * `lib/notify.ts` (sounds, pop-ups, muting), `lib/push.ts`, `public/sw.js` and
 * `server/src/services/push.ts` (the phone), `IncomingCall.tsx` (Do not
 * disturb only quiets the ring), `VoiceSettings.tsx`, `UserPanel.tsx`.
 * Change one of those, check this.
 */

import { useSyncExternalStore, type ReactNode } from 'react';

import { GUIDE_TOPICS, guide, type GuideTopic } from '../lib/guide';
import { openWalkthrough } from '../lib/walkthrough';
import { Modal } from './Modal';

const TAB: Record<GuideTopic, string> = {
  basics: 'How it works',
  notifications: 'Notifications',
  phone: 'Your phone',
  settings: 'Settings',
};

export function GuideGate() {
  const topic = useSyncExternalStore(guide.subscribe, guide.get);
  return topic ? <Guide topic={topic} /> : null;
}

function Guide({ topic }: { topic: GuideTopic }) {
  return (
    <Modal
      title="Guide"
      className="guide"
      onClose={guide.close}
      footer={
        <button type="button" className="button inline" onClick={guide.close}>
          Close
        </button>
      }
    >
      <div className="settings-tabs guide-tabs" role="tablist">
        {GUIDE_TOPICS.map((entry) => (
          <button
            key={entry}
            type="button"
            role="tab"
            aria-selected={entry === topic}
            className={entry === topic ? 'settings-tab active' : 'settings-tab'}
            onClick={() => guide.open(entry)}
          >
            {TAB[entry]}
          </button>
        ))}
      </div>
      <div className="guide-body" key={topic}>
        {PAGES[topic]}
      </div>
    </Modal>
  );
}

const PAGES: Record<GuideTopic, ReactNode> = {
  basics: (
    <>
      <p>
        Scryproof is our own chat app. It runs on our own server, not Discord&apos;s or anyone else&apos;s, so there&apos;s
        no company in the middle.
      </p>
      <p>
        <button
          type="button"
          className="button secondary inline"
          onClick={() => {
            guide.close();
            openWalkthrough();
          }}
        >
          Take the one-minute tour
        </button>
      </p>

      <h3>Getting around</h3>
      <ul>
        <li>The far left is your servers. Next to it are that server&apos;s channels.</li>
        <li>
          <b>#</b> channels are for typing. <b>♫</b> channels are voice rooms, and opening one puts you straight into the
          call.
        </li>
        <li>
          The <b>@</b> at the top left is your direct messages.
        </li>
        <li>
          Bottom left is you: mute, deafen, and the gear for settings. Click your name for your status, What&apos;s new,
          and this guide.
        </li>
        <li>
          When a new version is ready, a bar across the top says <b>Reload now</b>. Click it when you&apos;re not in a
          call.
        </li>
      </ul>

      <h3>On a phone</h3>
      <ul>
        <li>
          <b>☰</b> at the top left opens your servers and channels. Your name and the gear are at the bottom of that
          drawer.
        </li>
        <li>Press and hold a message to react, reply, edit, pin, save, copy or delete it.</li>
        <li>Press and hold a channel or a server to mute it.</li>
        <li>
          Put it on your home screen and it opens like an app. On an iPhone that&apos;s also the only way to get
          notifications. The <b>Your phone</b> tab has the steps.
        </li>
      </ul>

      <h3>What the server can&apos;t read</h3>
      <p>
        Calls, direct messages, and channels with <b>Encrypted</b> at the top are locked on the sender&apos;s device and
        unlocked only on the devices meant to read them. The server passes them on but can&apos;t read them, and neither
        can whoever runs it. It can see who posted and when. Channels without <b>Encrypted</b> are ordinary: the server
        can read those.
      </p>
    </>
  ),

  notifications: (
    <>
      <h3>Three ways it gets your attention</h3>
      <ul>
        <li>
          <b>A sound</b>, while Scryproof is open. A two-note sound when someone wants you, a short quiet one for
          everything else.
        </li>
        <li>
          <b>A pop-up on your computer</b>, when Scryproof is open but you&apos;re in another window. Off until you turn
          it on.
        </li>
        <li>
          <b>Your phone</b>, when Scryproof is closed. Off until you turn it on, once on each phone. See{' '}
          <b>Your phone</b>.
        </li>
      </ul>

      <h3>When someone wants you</h3>
      <p>
        A mention (someone typed <b>@</b> and your name), <b>@everyone</b>, or a direct message. These get the louder
        sound and reach your phone. Everything else said in a channel you can see is &ldquo;everything else&rdquo;.
      </p>

      <h3>The settings</h3>
      <p>
        The gear next to your name, then <b>Notifications</b>. Each device keeps its own, so your phone and your computer
        can be set differently.
      </p>
      <ul>
        <li>
          <b>When someone says your name</b>: the mention sound, and mentions and direct messages on your phone. Leave it
          on.
        </li>
        <li>
          <b>Notify this device</b>: notifications on this phone when Scryproof is closed. Under it,{' '}
          <b>Every channel message too</b> adds everything else. Off unless you want a lot of buzzing.
        </li>
        <li>
          <b>Show a pop-up when I am somewhere else</b>: computer pop-ups for mentions and direct messages. A direct
          message pop-up says who wrote, never what.
        </li>
        <li>
          <b>Show what a channel message says</b>: puts the words in the pop-up. Off, it only says who and where.
        </li>
        <li>
          <b>Sounds for everything else</b>: <b>Never</b>, <b>When I am somewhere else</b> (the usual choice), or{' '}
          <b>Every message</b>. A burst of messages makes one sound, not one each.
        </li>
        <li>
          <b>Volume</b>: how loud Scryproof&apos;s sounds are. Your device&apos;s own volume still applies.
        </li>
      </ul>

      <h3>Muting</h3>
      <p>
        Right-click a channel or a server (on a phone, press and hold it), then <b>Mute</b>. Muted means no sound, no
        pop-up and nothing on your phone, not even for a mention. It still shows as unread. Everything you&apos;ve muted
        is listed at the bottom of Notifications, with an Unmute button.
      </p>

      <h3>Do not disturb</h3>
      <p>
        Setting your status to Do not disturb stops calls ringing: the call still shows, it just doesn&apos;t make a
        sound. It doesn&apos;t silence messages. Mute for that.
      </p>
    </>
  ),

  phone: (
    <>
      <h3>What it says</h3>
      <p>Only ever one of these, and nothing else:</p>
      <ul>
        <li>
          <b>Someone messaged you</b>: a direct message or a group chat.
        </li>
        <li>
          <b>Someone mentioned you</b>: your name, or @everyone, in a channel.
        </li>
        <li>
          <b>New message in a channel</b>: only if you turned on <b>Every channel message too</b>.
        </li>
      </ul>
      <p>
        Never who, which server, or a word of the message. Someone picking up your phone learns only that something
        happened. Tap it and Scryproof opens on that message. Opening the app clears the number on the icon.
      </p>

      <h3>Turn it on: iPhone</h3>
      <ol>
        <li>Open scryproof.com in Safari and sign in.</li>
        <li>
          Tap Share (the square with the arrow), then <b>Add to Home Screen</b>. Already have the icon? Skip this.
        </li>
        <li>
          Open Scryproof from the icon on your home screen. It only works there, not in a Safari tab, and needs iOS 16.4
          or newer.
        </li>
        <li>
          <b>☰</b> at the top left, then the gear next to your name, then <b>Notifications</b>.
        </li>
        <li>
          Turn on <b>Notify this device</b> and tap <b>Allow</b>.
        </li>
      </ol>

      <h3>Turn it on: Android</h3>
      <ol>
        <li>Open scryproof.com in Chrome and sign in.</li>
        <li>
          Optional but nicer: tap your name, then <b>Install on this device</b>, and open it from the icon.
        </li>
        <li>
          <b>☰</b>, the gear, <b>Notifications</b>, turn on <b>Notify this device</b>, and tap <b>Allow</b>.
        </li>
      </ol>

      <h3>When nothing comes</h3>
      <ul>
        <li>
          Nothing arrives while you have Scryproof open on the phone itself. If you turned off <b>Even while I am on my
          computer</b> on that phone, nothing arrives while you&apos;re using it on a computer either.
        </li>
        <li>Nothing comes from a muted channel or server.</li>
        <li>
          <b>When someone says your name</b> has to be on, on that phone.
        </li>
        <li>
          On an iPhone, a Focus (Sleep, Work) can hold notifications back. And in the Settings app, under Notifications,
          Scryproof has to be allowed.
        </li>
        <li>
          If the switch says your device said no, allow notifications for Scryproof in your phone&apos;s settings, then
          turn the switch on again.
        </li>
        <li>Signing out of Scryproof on that phone stops them. Signing back in brings them back.</li>
      </ul>

      <h3>What Apple and Google see</h3>
      <p>
        Your phone&apos;s notifications travel through Apple or Google. All they carry is an empty wake-up: they learn
        that scryproof.com woke your phone, and when. The words are fetched from Scryproof directly, the moment your
        phone wakes.
      </p>
    </>
  ),

  settings: (
    <>
      <p>
        The gear next to your name opens these. Voice, notifications and themes are kept on each device separately. Your
        profile and account follow you everywhere.
      </p>

      <h3>Voice and audio</h3>
      <ul>
        <li>
          <b>Microphone</b>: which one, and when it&apos;s live. <b>Always on</b>, <b>When I talk</b> (only while
          you&apos;re louder than the line on the meter), or <b>Push to talk</b> (only while you hold a key).
        </li>
        <li>
          <b>Noise suppression</b>: <b>Strong</b> keeps your voice and drops keyboards, fans and breathing.{' '}
          <b>Standard</b> takes out steady noise. <b>Off</b> is your microphone as it is. <b>Hear it</b> lets you listen
          to yourself.
        </li>
        <li>
          <b>Echo cancellation</b>, <b>Automatic volume</b> and <b>Loudness guard</b> (keeps a knock or a pop down near
          talking level). Leave them on unless you know you don&apos;t want them.
        </li>
        <li>
          <b>Voice changer</b>: Robot, Chipmunk or Deep, on your voice before it&apos;s sent.
        </li>
        <li>
          <b>Speakers</b>: everyone&apos;s volume, the soundboard&apos;s, and the sounds for joining, leaving and muting.
          For one person&apos;s volume, click them in the call.
        </li>
        <li>
          <b>Camera</b>, <b>Screen share quality</b> and <b>Video you receive</b>. Lower is easier on a slow connection.
        </li>
      </ul>

      <h3>Notifications</h3>
      <p>
        Sounds, pop-ups, your phone, and what you&apos;ve muted. The <b>Notifications</b> tab explains each switch.
      </p>

      <h3>Themes</h3>
      <p>How Scryproof looks, on this device only.</p>

      <h3>Edit profile</h3>
      <p>Your name, your picture, and the line under your name.</p>

      <h3>Account</h3>
      <p>
        Change your password (it signs you out everywhere else), and turn on a second step at sign-in with an
        authenticator app on your phone.
      </p>

      <h3>Blocked people</h3>
      <p>
        Who you&apos;ve blocked. Their messages are collapsed and they can&apos;t ping you. Unblock them from here.
      </p>

      <h3>Behind your name</h3>
      <p>
        Click your name (not the gear) for your status dot (Online, Idle, Do not disturb, Invisible), What&apos;s new,
        the tour, this guide, installing the app, and signing out.
      </p>
    </>
  ),
};
