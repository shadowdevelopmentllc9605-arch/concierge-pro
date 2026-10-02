import React, { useRef, useState, useCallback } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { RefreshCw } from 'lucide-react';

const THRESHOLD = 72;

export default function PullToRefresh({ onRefresh, children }) {
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(null);
  const pullY = useMotionValue(0);
  const opacity = useTransform(pullY, [0, THRESHOLD], [0, 1]);
  const rotate = useTransform(pullY, [0, THRESHOLD], [0, 360]);
  const containerRef = useRef(null);

  const handleTouchStart = useCallback((e) => {
    const el = containerRef.current;
    if (el && el.scrollTop === 0) {
      startY.current = e.touches[0].clientY;
    }
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (startY.current === null || refreshing) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) {
      e.preventDefault();
      pullY.set(Math.min(delta * 0.5, THRESHOLD + 20));
    }
  }, [refreshing, pullY]);

  const handleTouchEnd = useCallback(async () => {
    if (startY.current === null) return;
    startY.current = null;
    if (pullY.get() >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      await animate(pullY, THRESHOLD, { duration: 0.1 });
      await onRefresh();
      setRefreshing(false);
    }
    animate(pullY, 0, { type: 'spring', stiffness: 300, damping: 30 });
  }, [pullY, refreshing, onRefresh]);

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ overscrollBehavior: 'none', height: '100%', overflowY: 'auto' }}
    >
      <motion.div style={{ y: pullY }} className="relative">
        {/* Pull indicator */}
        <motion.div
          style={{ opacity }}
          className="absolute top-0 left-0 right-0 flex justify-center -translate-y-12 z-10 pointer-events-none"
        >
          <div className="w-10 h-10 bg-white dark:bg-slate-800 rounded-full shadow-lg flex items-center justify-center">
            <motion.div style={{ rotate }}>
              <RefreshCw className={`w-5 h-5 text-violet-600 ${refreshing ? 'animate-spin' : ''}`} />
            </motion.div>
          </div>
        </motion.div>
        {children}
      </motion.div>
    </div>
  );
}