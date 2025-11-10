import React, { useEffect, useRef, useState } from 'react';

type Platform = {
  x: number;
  y: number;
  w: number;
  h: number;
  vy?: number; // vertical velocity so platforms can slide into view
};

export const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [score, setScore] = useState(0);
  const [running, setRunning] = useState(true);
  const [gameOver, setGameOver] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current!;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    // HiDPI support
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    // Game state
    const player = {
      x: window.innerWidth / 2,
      y: window.innerHeight - 80,
      r: 18,
      vx: 0,
      vy: 0,
    };

    const gravity = 0.6;
    const jumpVel = -25.5;
    // give a fair initial boost so the player starts by rising
    player.vy = jumpVel * 0.85;
    const friction = 0.98;

  let platforms: Platform[] = [];
  // Increase pool size so we can pre-generate more platforms and avoid gaps
  // when the player rises quickly. This is still a modest number to keep
  // CPU work low; we also allow spawning multiple platforms per frame below.
  // larger pool so we can hold more platforms without constantly reallocating
  const platformCount = 30;

    const makePlatform = (y: number, vy = 1.5) => {
      const w = 80 + Math.random() * 120;
      const x = Math.random() * (window.innerWidth - w - 20) + 10;
      return { x, y, w, h: 14, vy } as Platform;
    };

    // place a centered starting platform under the player so there's solid ground in the middle
  const centerW = 140;
  const centerX = Math.max(10, (window.innerWidth - centerW) / 2);
  const centerY = player.y + player.r + 6; // slightly below the player start
  // center platform should be static (vy = 0) so player can stand
  platforms.push({ x: centerX, y: centerY, w: centerW, h: 14, vy: 0 });

    // initial random platforms (a small number so the start isn't cluttered).
    // We'll let the runtime spawn logic fill further above the view as needed.
    const initialCount = Math.min(8, platformCount - 1);
    for (let i = 0; i < initialCount; i++) {
      const y = window.innerHeight - (i * window.innerHeight) / (initialCount - 1 || 1) - 20 - 80;
      platforms.push(makePlatform(y));
    }

    let lastTime = 0;
    let rafId = 0;
    let keys: Record<string, boolean> = {};

    // scoring: how much world has scrolled upwards
    let worldScroll = 0;

    const handleKey = (e: KeyboardEvent) => {
      if (e.type === 'keydown') keys[e.key] = true;
      else keys[e.key] = false;
    };

    window.addEventListener('keydown', handleKey);
    window.addEventListener('keyup', handleKey);

    // mouse / touch control for left/right
    const handleMove = (clientX: number) => {
      const targetX = clientX;
      player.vx += (targetX - player.x) * 0.0025;
    };
    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX);
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches && e.touches[0]) handleMove(e.touches[0].clientX);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('touchmove', onTouchMove, { passive: true });

    // reset handled via reload button for now; function intentionally omitted to avoid unused var

    const step = (t: number) => {
      const dt = Math.min(32, t - lastTime);
      lastTime = t;

      // input
      if (keys['ArrowLeft'] || keys['a'] || keys['A']) player.vx -= 0.6;
      if (keys['ArrowRight'] || keys['d'] || keys['D']) player.vx += 0.6;

      player.vx *= friction;
      player.x += player.vx * (dt / 16);
      player.vy += gravity * (dt / 16);
      player.y += player.vy * (dt / 16);

      // wrap horizontally
      if (player.x < -player.r) player.x = window.innerWidth + player.r;
      if (player.x > window.innerWidth + player.r) player.x = -player.r;

      // advance platforms by their vertical velocities so they slide into view
      for (const p of platforms) {
        if (p.vy) p.y += p.vy * (dt / 16);
      }

      // collision with platforms (only when falling)
      if (player.vy > 0) {
        for (const p of platforms) {
          if (
            player.x + player.r > p.x &&
            player.x - player.r < p.x + p.w &&
            player.y + player.r > p.y &&
            player.y + player.r < p.y + p.h + player.vy * (dt / 16)
          ) {
            // land on platform
            player.vy = jumpVel;
            player.y = p.y - player.r - 0.01;
          }
        }
      }

      // scroll up when player reaches upper third
      const scrollThreshold = window.innerHeight * 0.33;
      if (player.y < scrollThreshold) {
        const shift = scrollThreshold - player.y;
        player.y = scrollThreshold;
        for (const p of platforms) p.y += shift;
        worldScroll += shift;
        setScore((s) => Math.max(s, Math.floor(worldScroll)));
      }

      // remove platforms below screen
      platforms = platforms.filter((p) => p.y < window.innerHeight + 50);

      // Spawn platforms until we reach the desired pool size. When the player
      // ascends very fast the world can move up by many pixels in a single
      // frame, so adding only one platform per frame leaves gaps. Use a
      // tighter spacing and a smaller spawn buffer so platforms appear closer
      // to the visible area and fill the gap quickly.
      // Spawn platforms to cover a lookahead region above the viewport.
      // To avoid gaps when the player ascends very fast, allow several
      // spawns per frame scaled by upward velocity, but cap it so we don't
      // create an unbounded number of platforms in one frame.
      {
  // larger lookahead so we prefill more of the world above the viewport
  const lookahead = window.innerHeight * 2.0; // two screens above
        // find highest (minimum y). If no platforms exist, start from top of screen
        let highest = platforms.length ? Math.min(...platforms.map((p) => p.y)) : window.innerHeight;
        const desiredTopY = -lookahead;

        // Base spawn cap and scale with upward speed (player.vy is negative when moving up)
  const baseSpawnCap = 8; // spawn more by default
  const speedFactor = Math.max(1, Math.ceil(Math.abs(player.vy) / 6));
  const maxSpawnPerFrame = Math.min(48, baseSpawnCap * speedFactor); // hard cap

        let spawned = 0;
        // Keep spawning while the top-most platform is below the desired top
        // and we haven't exceeded the per-frame spawn cap.
        while (highest > desiredTopY && spawned < maxSpawnPerFrame) {
          // tighter spacing to pack platforms more densely when filling lookahead
          const spacing = 50 + Math.random() * 80;
          const newY = highest - spacing; // place just above the current highest
          platforms.push(makePlatform(newY, 0.6 + Math.random() * 0.6));
          highest = newY;
          spawned++;
        }

        // If we still have room in the pool after filling lookahead, gently
        // top up until platformCount, but with a small extra cap so startup
        // doesn't create too many.
        let topUpCap = 12;
        while (platforms.length < platformCount && spawned < maxSpawnPerFrame + topUpCap) {
          const spacing = 70 + Math.random() * 120;
          const newY = highest - spacing;
          platforms.push(makePlatform(newY, 0.6 + Math.random() * 0.6));
          highest = newY;
          spawned++;
        }
      }

      // game over if player falls below bottom
      if (player.y - player.r > window.innerHeight) {
        setGameOver(true);
        setRunning(false);
      }

      // draw
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // background
      ctx.fillStyle = '#e6f2ff';
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

      // platforms
      ctx.fillStyle = '#2b6cb0';
      for (const p of platforms) {
        ctx.fillRect(p.x, p.y, p.w, p.h);
      }

      // player
      ctx.beginPath();
      ctx.fillStyle = '#ff6b6b';
      ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.closePath();

      // score
      ctx.fillStyle = '#0f172a';
      ctx.font = '20px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';
      ctx.fillText(`Score: ${score}`, 14, 28);

      if (running) rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('keyup', handleKey);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('touchmove', onTouchMove as any);
    };
  // don't re-run the whole setup when `score` changes each frame — that caused
  // the canvas/game loop to reinitialize and produced a visible "refresh".
  // Keep `running` so we can stop/start the loop when that state changes.
  }, [running]);

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-start bg-[#e6f2ff]">
      <div className="w-full flex items-center justify-between px-4 py-2 bg-white/60 backdrop-blur-sm">
        <div className="text-lg font-semibold">Platform Jumper</div>
        <div className="text-sm">Score: {score}</div>
      </div>

      <canvas ref={canvasRef} style={{ display: 'block', touchAction: 'none' }} />

      <div className="fixed left-4 bottom-4 text-sm bg-white/80 p-2 rounded shadow">
        <div>Controls: Arrow keys or A/D to move, move mouse/touch to steer.</div>
        <div className="mt-1">Goal: keep jumping — score increases as you climb.</div>
      </div>

      {gameOver && (
        <div className="fixed inset-0 flex items-center justify-center">
          <div className="bg-white p-6 rounded shadow-lg text-center w-80">
            <h2 className="text-2xl font-bold mb-2">Game Over</h2>
            <p className="mb-4">Score: {score}</p>
            <div className="flex gap-3 justify-center">
              <button
                className="px-4 py-2 bg-blue-600 text-white rounded"
                onClick={() => window.location.reload()}
              >
                Restart
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
