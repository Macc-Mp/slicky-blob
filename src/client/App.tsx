import React, { useEffect, useRef, useState } from 'react';

type Platform = {
  x: number;
  y: number;
  w: number;
  h: number;
  vy?: number; // vertical velocity so platforms can slide into view
  kind?: 'normal' | 'hot';
};
export const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [score, setScore] = useState(0);
  const scoreRef = useRef(0);
  // friendly messages to show after repeated platform contacts
  const engageMessage = [
    "Good Job!",
    "Well Played!",
    "Awesome!",
    "Great!",
    "Fantastic!",
    "Impressive!",
    "Nice!",
    "Superb!",
  ];

  // persist across renders and frames
  const platformContactRef = useRef(false);
  const messageCounterRef = useRef(0);
  const [greeting, setGreeting] = useState<string | undefined>(undefined);
  // start paused; user must click/tap to begin (works on desktop & mobile)
  const [running, setRunning] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [highScore, setHighScore] = useState<number>(() => {
    try {
      return Number(localStorage.getItem('highScore') || 0);
    } catch {
      return 0;
    }
  });
  const [isNewHigh, setIsNewHigh] = useState(false);

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
      // base jump velocity (negative). We'll compute an effective jump velocity
      // based on player size so bigger blobs bounce higher.
      const baseJumpVel = -25.5;
  // give a fair initial boost so the player starts by rising
  player.vy = baseJumpVel * 0.85;
    const friction = 0.98;

  let platforms: Platform[] = [];
  // power pellets (collectibles) that increase player size on touch
  type Pellet = { x: number; y: number; r: number; vy?: number };
  let pellets: Pellet[] = [];
  // enemy projectile: sunbean moves horizontally across the screen
  type Sunbean = { x: number; y: number; r: number; vx: number; dir: 'left' | 'right' };
  let sunbeans: Sunbean[] = [];
  const basePlayerR = 18; // initial player radius used to scale bounce
  const maxPlayerR = 40;
  const minPlayerR = 10; // minimum radius when damaged
  const sizeToBounceFactor = 0.45; // how much extra bounce per size growth

  const getJumpVel = () => {
    const sizeDelta = Math.max(0, player.r - basePlayerR) / basePlayerR;
    const factor = 1 + sizeDelta * sizeToBounceFactor;
    return baseJumpVel * factor;
  };
  // Increase pool size so we can pre-generate more platforms and avoid gaps
  // when the player rises quickly. This is still a modest number to keep
  // CPU work low; we also allow spawning multiple platforms per frame below.
  // larger pool so we can hold more platforms without constantly reallocating
  const platformCount = 35;

  // how far below the viewport to keep platforms (smaller = remove faster)
  // reduce this value to remove platforms sooner; increase to keep them longer.
  const platformRemoveMargin = Math.max(8, Math.floor(basePlayerR * 1.0));

    const makePlatform = (y: number, vy = 1.5) => {
      const w = 80 + Math.random() * 120;
      const x = Math.random() * (window.innerWidth - w - 20) + 10;
      // small chance for a "hot" (damage) platform
      const kind = Math.random() < 0.12 ? 'hot' : 'normal';
      const p = { x, y, w, h: 14, vy, kind } as Platform;
      // small chance to spawn a power pellet above this platform (only on normal platforms)
      if (kind === 'normal' && Math.random() < 0.14) {
        const pelletR = 7 + Math.random() * 4;
        pellets.push({ x: x + w / 2, y: y - 20 - pelletR, r: pelletR, vy });
      }
      // small chance to spawn a sunbean projectile near this platform
      if (Math.random() < 0.10) {
        const sbR = 8 + Math.random() * 6;
        const dir = Math.random() < 0.5 ? 'left' : 'right';
        const speed = 2.5 + Math.random() * 2.5;
        const startX = dir === 'left' ? window.innerWidth + sbR + 8 : -sbR - 8;
        const vx = dir === 'left' ? -speed : speed;
        // place sunbean slightly above the platform so it traverses across
        sunbeans.push({ x: startX, y: y - 18 - sbR, r: sbR, vx, dir: dir === 'left' ? 'left' : 'right' });
      }
      return p;
    };

  //   // place a centered starting platform under the player so there's solid ground in the middle
  // const centerW = 140;
  // const centerX = Math.max(10, (window.innerWidth - centerW) / 2);
  // const centerY = player.y + player.r + 6; // slightly below the player start
  // // center platform should be static (vy = 0) so player can stand
  // platforms.push({ x: centerX, y: centerY, w: centerW, h: 14, vy: 0 });

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
      if (keys['ArrowLeft'] || keys['a'] || keys['A']) player.vx -= 0.5;
      if (keys['ArrowRight'] || keys['d'] || keys['D']) player.vx += 0.5;

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
            // mark contact via ref (persisted across frames/renders)
            platformContactRef.current = true;
            // increment the counter and show a greeting after N contacts
            messageCounterRef.current++;
            if (messageCounterRef.current >= 5) {
              const randomIndex = Math.floor(Math.random() * engageMessage.length);
              setGreeting(engageMessage[randomIndex]);
              messageCounterRef.current = 0;
              platformContactRef.current = false;
            }
            // landing behavior
            if (p.kind === 'hot') {
              // damage platform: shrink player and reduce bounce
              const shrink = Math.max(3, Math.floor(player.r * 0.2));
              player.r = Math.max(minPlayerR, player.r - shrink);
              // reduced bounce using the new size
              player.vy = getJumpVel() * 0.6;
            } else {
              // normal platform
              player.vy = getJumpVel();
            }
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
  // update score and keep a ref with the latest value so we can access
  // it from inside this effect when the game ends
  const newScore = Math.max(scoreRef.current, Math.floor(worldScroll));
  scoreRef.current = newScore;
  setScore(newScore);
      }

  // remove platforms below screen (use configurable margin)
  platforms = platforms.filter((p) => p.y < window.innerHeight + platformRemoveMargin);

        // update pellets and handle collection
        if (pellets.length) {
          // advance pellet positions
          for (const pel of pellets) {
            if (pel.vy) pel.y += pel.vy * (dt / 16);
          }

    const keep: Pellet[] = [];
          for (const pel of pellets) {
            // collect if overlapping player
            const dx = pel.x - player.x;
            const dy = pel.y - player.y;
            const distSq = dx * dx + dy * dy;
            const hit = distSq <= (pel.r + player.r) * (pel.r + player.r);
            if (hit) {
              // increase player size, cap to maxPlayerR
              player.r = Math.min(maxPlayerR, player.r + Math.max(3, Math.floor(pel.r * 0.6)));
              // optional: give an immediate tiny upward boost so pickup feels bouncy
              player.vy = Math.min(player.vy, baseJumpVel * 0.25);
            } else if (pel.y < window.innerHeight + 50) {
              keep.push(pel);
            }
          }
          pellets = keep;
        }
        
        // update sunbeans (enemy projectiles) and handle collisions
        if (sunbeans.length) {
          const keepSB: Sunbean[] = [];
          for (const sb of sunbeans) {
            sb.x += sb.vx * (dt / 16);

            // collision with player (circle overlap)
            const dx = sb.x - player.x;
            const dy = sb.y - player.y;
            const distSq = dx * dx + dy * dy;
            const hit = distSq <= (sb.r + player.r) * (sb.r + player.r);
            if (hit) {
              // damage effect: larger shrink and reduced bounce + small knockback
              const shrink = Math.max(4, Math.floor(player.r * 0.25));
              player.r = Math.max(minPlayerR, player.r - shrink);
              player.vy = getJumpVel() * 0.5;
              // push horizontally away from sunbean
              player.vx += (dx > 0 ? 1 : -1) * 2;
              continue; // don't keep this sunbean
            }

            // keep while on-screen (with small margin)
            if (sb.x > -50 && sb.x < window.innerWidth + 50) keepSB.push(sb);
          }
          sunbeans = keepSB;
        }

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
        // finalize score and persist high score
        try {
          const finalScore = scoreRef.current;
          const prev = Number(localStorage.getItem('highScore') || 0);
          if (finalScore > prev) {
            localStorage.setItem('highScore', String(finalScore));
            setHighScore(finalScore);
            setIsNewHigh(true);
          }
        } catch {
          // ignore localStorage errors
        }
      }

      // draw
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // background
      ctx.fillStyle = '#616f7eff';
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

      // platforms
      for (const p of platforms) {
        if (p.kind === 'hot') {
          // hot/damage platform style (warm gradient)
          const g = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.h);
          g.addColorStop(0, '#ffb86b');
          g.addColorStop(1, '#ff6b6b');
          ctx.fillStyle = g;
        } else {
          ctx.fillStyle = '#8e9ba8ff';
        }
        ctx.fillRect(p.x, p.y, p.w, p.h);
      }

        // power pellets
        if (pellets.length) {
          for (const pel of pellets) {
            const g = ctx.createRadialGradient(pel.x, pel.y - pel.r * 0.3, pel.r * 0.1, pel.x, pel.y, pel.r);
            g.addColorStop(0, 'rgba(31, 100, 157, 0.95)');
            g.addColorStop(0.6, 'rgba(60, 89, 255, 0.95)');
            g.addColorStop(1, 'rgba(20, 180, 220, 0.95)');
            ctx.beginPath();
            ctx.fillStyle = g;
            ctx.arc(pel.x, pel.y, pel.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.closePath();
          }
        }

      // draw sunbeans (enemy projectiles)
      if (sunbeans.length) {
        for (const sb of sunbeans) {
          // glowing radial core
          const g = ctx.createRadialGradient(sb.x, sb.y, sb.r * 0.1, sb.x, sb.y, sb.r);
          g.addColorStop(0, 'rgba(255,245,180,0.98)');
          g.addColorStop(0.6, 'rgba(255,200,60,0.95)');
          g.addColorStop(1, 'rgba(255,120,30,0.9)');
          ctx.beginPath();
          ctx.fillStyle = g;
          ctx.arc(sb.x, sb.y, sb.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.closePath();

          // small rotating rays to suggest a sunlike projectile
          const rays = 6;
          const time = performance.now();
          ctx.strokeStyle = 'rgba(255,200,80,0.9)';
          ctx.lineWidth = Math.max(1, sb.r * 0.08);
          for (let i = 0; i < rays; i++) {
            const a = (i / rays) * Math.PI * 2 + (time / 500) % (Math.PI * 2);
            const sx = sb.x + Math.cos(a) * (sb.r * 0.9);
            const sy = sb.y + Math.sin(a) * (sb.r * 0.9);
            const ex = sb.x + Math.cos(a) * (sb.r * 1.6);
            const ey = sb.y + Math.sin(a) * (sb.r * 1.6);
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(ex, ey);
            ctx.stroke();
            ctx.closePath();
          }
        }
      }

      // player (draw as a wobbling slime blob)
      // compute a squash/stretch based on vertical velocity and a small
      // sinusoidal wobble so the blob looks jiggly
      {
        const time = t || performance.now();
        // base scale from vertical velocity: positive vy => falling (stretch),
        // negative vy => rising (slightly squashed). We clamp to avoid extreme scales.
        const vyFactor = Math.max(-1, Math.min(1, player.vy / 24));
        // scaleY > 1 stretches vertically when falling; scaleX compensates to keep area similar
        const scaleY = 1 + vyFactor * 0.35;
        const scaleX = 1 / Math.max(0.5, scaleY);

        // wobble uses time to create small oscillations; add a phase based on player.x
        const wobble = Math.sin(time / 120 + player.x * 0.02) * 0.06;
        const finalScaleX = scaleX * (1 + wobble * 0.5);
        const finalScaleY = scaleY * (1 - wobble * 0.5);

        ctx.save();
        ctx.translate(player.x, player.y);
        ctx.scale(finalScaleX, finalScaleY);

        // soft radial fill for slime look
        const grad = ctx.createRadialGradient(0, 0, player.r * 0.2, 0, 0, player.r);
        grad.addColorStop(0, '#80bff7');
        grad.addColorStop(0.6, '#4ea0f0');
        grad.addColorStop(1, '#2f85d9');

        ctx.beginPath();
        ctx.fillStyle = grad;
        // draw base ellipse (as scaled circle)
        ctx.arc(0, 0, player.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.closePath();

        // small glossy highlight
        ctx.beginPath();
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.ellipse(-player.r * 0.35, -player.r * 0.45, player.r * 0.45, player.r * 0.25, -0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.closePath();

        ctx.restore();

        // small blob droplets that orbit slightly — drawn without scaling so
        // they sit naturally around the blob even when it stretches
        for (let i = 0; i < 3; i++) {
          const phase = time / 180 + i * (Math.PI * 2 / 3);
          const angle = phase * 0.8;
          const dist = player.r * (0.9 + Math.sin(phase) * 0.15);
          const bx = player.x + Math.cos(angle) * dist;
          const by = player.y + Math.sin(angle) * dist * 0.6; // squish vertically a bit
          const br = Math.max(2, player.r * (0.18 + Math.abs(Math.sin(phase)) * 0.06));
          ctx.beginPath();
          ctx.fillStyle = '#2f85d9';
          ctx.arc(bx, by, br, 0, Math.PI * 2);
          ctx.fill();
          ctx.closePath();
        }
      }



      if (running) rafId = requestAnimationFrame(step);
    };

  // only start the RAF loop when `running` is true so the game waits for
  // a user-initiated click/tap to begin on both PC and phone.
  if (running) rafId = requestAnimationFrame(step);

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
  <div className="w-full flex items-center justify-between px-4 py-2 bg-white/60 backdrop-blur-sm rounded-lg overflow-hidden">
        <div className="text-lg font-semibold">{greeting}</div>
        <div className="text-sm">Score: {score} — Best: {highScore}</div>
      </div>

      <canvas ref={canvasRef} style={{ display: 'block', touchAction: 'none' }} />

      {/* Click / tap overlay to start the game on desktop and mobile */}
      {!running && !gameOver && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/30"
          onClick={() => {
            scoreRef.current = 0;
            setScore(0);
            setGameOver(false);
            setIsNewHigh(false);
            setRunning(true);
          }}
          onTouchStart={() => {
            scoreRef.current = 0;
            setScore(0);
            setGameOver(false);
            setIsNewHigh(false);
            setRunning(true);
          }}
        >
          <div className="bg-white/90 p-6 rounded shadow-lg text-center w-80 cursor-pointer">
            <h2 className="text-2xl font-bold mb-2">Slicky Blob</h2>
            <p className="mb-4">High Score: {highScore}</p>
            <p className="mb-4">Click or tap to start</p>
            <div className="text-sm text-muted-foreground">Controls: Arrow keys or A/D, or move mouse/touch to steer.</div>
          </div>
        </div>
      )}

      {/* <div className="fixed left-4 bottom-4 text-sm bg-white/80 p-2 rounded shadow">
        <div>Controls: Arrow keys or A/D to move, move mouse/touch to steer.</div>
        <div className="mt-1">Goal: keep jumping — score increases as you climb.</div>
      </div> */}

      {gameOver && (
        <div className="fixed inset-0 flex items-center justify-center">
          <div className="bg-white p-6 rounded shadow-lg text-center w-80">
            <h2 className="text-2xl font-bold mb-2">Game Over</h2>
              <p className="mb-2">Score: {score}</p>
              <p className="mb-4">Best: {highScore}{isNewHigh ? ' — New High!' : ''}</p>
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
