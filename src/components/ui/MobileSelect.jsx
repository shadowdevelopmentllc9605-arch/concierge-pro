import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronDown, X } from 'lucide-react';

// Detects mobile viewport
const isMobile = () => typeof window !== 'undefined' && window.innerWidth < 1024;

// Replaces shadcn Select on mobile with a bottom-sheet drawer
export function MobileSelect({ value, onValueChange, placeholder, children }) {
  const [open, setOpen] = useState(false);
  const [mobile] = useState(isMobile);

  // Parse children to extract options
  const options = [];
  React.Children.forEach(children, (child) => {
    if (child?.type?.displayName === 'MobileSelectItem' || child?.props?.value !== undefined) {
      options.push({ value: child.props.value, label: child.props.children });
    }
  });

  const selectedLabel = options.find(o => o.value === value)?.label || placeholder || 'Select...';

  if (!mobile) {
    // Render native-ish on desktop (just a styled button + popover handled by parent)
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 hover:bg-slate-50 transition"
        >
          <span className={value ? '' : 'text-slate-400'}>{selectedLabel}</span>
          <ChevronDown className="w-4 h-4 text-slate-400" />
        </button>
        <AnimatePresence>
          {open && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="absolute top-full mt-1 left-0 right-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden"
              >
                {options.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { onValueChange(opt.value); setOpen(false); }}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm text-left hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                  >
                    <span>{opt.label}</span>
                    {value === opt.value && <Check className="w-4 h-4 text-violet-600" />}
                  </button>
                ))}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Mobile: bottom sheet
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-between px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100"
      >
        <span className={value ? '' : 'text-slate-400'}>{selectedLabel}</span>
        <ChevronDown className="w-4 h-4 text-slate-400" />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black z-50"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-slate-900 rounded-t-2xl shadow-2xl"
              style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
              <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="font-semibold text-slate-900 dark:text-white">{placeholder || 'Select'}</span>
                <button onClick={() => setOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                  <X className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                </button>
              </div>
              <div className="max-h-72 overflow-y-auto py-2">
                {options.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { onValueChange(opt.value); setOpen(false); }}
                    className="w-full flex items-center justify-between px-4 py-4 text-sm text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition active:bg-slate-100"
                  >
                    <span className={`text-slate-900 dark:text-white ${value === opt.value ? 'font-semibold text-violet-600' : ''}`}>
                      {opt.label}
                    </span>
                    {value === opt.value && <Check className="w-4 h-4 text-violet-600" />}
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

export function MobileSelectItem({ value, children }) {
  return null; // Used as data source only, rendering handled by MobileSelect
}
MobileSelectItem.displayName = 'MobileSelectItem';