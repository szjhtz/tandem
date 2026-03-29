import { motion } from "motion/react";
import { useEffect, useState } from "react";

export function PlanGenerationAnimation() {
  const [nodes, setNodes] = useState<{ id: number; x: number; y: number }[]>([]);

  useEffect(() => {
    // Simulate nodes appearing
    const interval = setInterval(() => {
      setNodes((prev) => {
        if (prev.length > 8) return prev;
        return [
          ...prev,
          {
            id: Date.now(),
            x: 20 + Math.random() * 60,
            y: 20 + Math.random() * 60,
          },
        ];
      });
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl border border-white/5 bg-black/40">
      <div className="absolute inset-0 opacity-20">
        <div className="tcp-shell-glow tcp-shell-glow-a opacity-50" />
        <div className="tcp-shell-glow tcp-shell-glow-b opacity-30" />
      </div>

      <svg viewBox="0 0 100 100" className="relative z-10 h-full w-full">
        <defs>
          <radialGradient id="nodeGradient">
            <stop offset="0%" stopColor="var(--color-primary)" />
            <stop offset="100%" stopColor="var(--color-primary-muted)" />
          </radialGradient>
        </defs>

        {/* Center Intent node */}
        <motion.circle
          cx="50"
          cy="50"
          r="4"
          fill="url(#nodeGradient)"
          initial={{ scale: 0 }}
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
        <motion.circle
          cx="50"
          cy="50"
          r="8"
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="0.5"
          strokeDasharray="2 2"
          animate={{ rotate: 360 }}
          transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
        />

        {/* Generated Nodes and Connections */}
        {nodes.map((node, i) => (
          <g key={node.id}>
            <motion.line
              x1="50"
              y1="50"
              x2={node.x}
              y2={node.y}
              stroke="var(--color-primary)"
              strokeWidth="0.3"
              strokeOpacity="0.4"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1, ease: "easeOut" }}
            />
            <motion.circle
              cx={node.x}
              cy={node.y}
              r="2"
              fill="rgba(255,255,255,0.15)"
              stroke="var(--color-primary)"
              strokeWidth="0.5"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.5 }}
            />
            <motion.circle
              cx={node.x}
              cy={node.y}
              r="1.2"
              fill="var(--color-primary)"
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: Math.random() }}
            />
          </g>
        ))}

        {/* Floating dust/data particles */}
        {[...Array(12)].map((_, i) => (
          <motion.circle
            key={i}
            cx={10 + Math.random() * 80}
            cy={10 + Math.random() * 80}
            r="0.4"
            fill="var(--color-text-subtle)"
            animate={{
              y: [0, -10, 0],
              opacity: [0.2, 0.6, 0.2],
            }}
            transition={{
              duration: 3 + Math.random() * 4,
              repeat: Infinity,
              delay: Math.random() * 2,
            }}
          />
        ))}
      </svg>

      <div className="absolute inset-x-0 bottom-6 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-black/60 px-4 py-2 backdrop-blur-md">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          <span className="font-display text-xs font-semibold uppercase tracking-widest text-primary">
            Synthesizing Plan Flow
          </span>
        </div>
      </div>
    </div>
  );
}
