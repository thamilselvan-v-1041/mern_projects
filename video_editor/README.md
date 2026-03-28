# Video Editor with AI Clip Generation

A real-time video editor with **AI-powered video generation** — generate clips from text and insert them into your timeline. Built on [free-react-video-editor](https://github.com/reactvideoeditor/free-react-video-editor).

## Features

- **Master timeline (KineMaster-inspired)** — Separate **Video** and **Text** tracks, time ruler (seconds at 30 fps), playhead across ruler + tracks
- **Edit tools** — Select a layer, **drag** to move it in time, **Split** at the playhead, **Delete** selection; click empty track to deselect
- **Layer order** — All video clips render first, then text on top (like a simple multi-layer stack)
- **Generate AI Clip** — Describe a video in text, AI creates it, insert at playhead (Replicate)
- **Free tier** — Uses Replicate (free credits for new accounts)

This is **not** a full KineMaster replacement: no speed curves, audio tracks, transitions, keyframes, stickers, or mobile-optimized UI—but the timeline workflow is closer to layered mobile editors than a single-row strip.

## Quick Setup

```bash
npm install
cp .env.local.example .env.local   # Add REPLICATE_API_TOKEN (get at replicate.com)
npm run dev
```

Open [http://localhost:3010](http://localhost:3010). Click **Generate AI Clip**, describe your video, and it’s inserted at the playhead.

---

# React Video Editor (Open Source Edition)

A free, open-source basic video editor example that runs directly in your web browser. This project serves as a foundation for video editing capabilities and is a simplified version of the full-featured [React Video Editor](https://www.reactvideoeditor.com/).

Built with:
- [Next.js](https://nextjs.org/) - React framework for server-side rendering and static site generation
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework
- [Remotion](https://www.remotion.dev/) - Framework for programmatically creating videos
- [React](https://reactjs.org/) - JavaScript library for building user interfaces

## Demo

Try out the live demo: [React Video Editor (Open Source Edition)](https://www.reactvideoeditor.com/open-source)

## About the Project

This React Video Editor serves as a foundational tool for understanding and interacting with the core building blocks of Remotion. It offers a user-friendly, browser-based interface that allows users to compose videos by arranging clips and adding text overlays seamlessly. While the current version provides a smooth and interactive experience, it's designed to be a stepping stone toward building a fully-fledged video editor

Key features include:

- Arranging video clips on a timeline
- Adding static text overlays to videos
- Real-time preview of composition

While this open-source version provides basic video composition functionality, it does not include advanced editing features. For a more comprehensive video editing solution, check out the [pro version](https://www.reactvideoeditor.com/) which offers additional capabilities and integration options for React applications.

**Important Note:** This project uses the Remotion video player. If you intend to use this project, please be aware that you may need a Remotion license depending on your use case. Check out the [Remotion Licensing](https://www.remotion.dev/docs/licensing) page for more information and ensure you comply with their licensing terms.

## Getting Started

To get started with this project, follow these steps:

1. Clone the repository to your local machine.

2. Install the dependencies:

```bash
npm install
```

3. Run the development server:

```bash
npm run dev
```

4. Open [http://localhost:3010](http://localhost:3010) in your browser (or run `npm run start` after `npm run build` if dev has issues).

You can start editing the project by modifying the files in the `app` directory. The page will auto-update as you make changes.


## License

This project is licensed under the React Video Editor Pro (RVE) License. For detailed terms and conditions, please visit our [License Page](https://www.reactvideoeditor.com/important/license).

### Licensing Requirements

React Video Editor Pro utilizes [Remotion](https://www.remotion.dev/) for video rendering capabilities. Please note:

1. For commercial use, you must obtain:
   - A React Video Editor Pro license
   - A separate Remotion license

2. The React Video Editor Pro license does not include Remotion licensing rights. For Remotion licensing information, please refer to their [official license terms](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md).

Ensure compliance with both licenses before deploying to production.
