import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { HelpCircle, AlertTriangle, AlertCircle, CheckCircle } from "lucide-react";

interface CustomConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  type?: "confirm" | "alert" | "error" | "success";
  showInput?: boolean;
  inputDefaultValue?: string;
  inputPlaceholder?: string;
  onConfirmWithInput?: (val: string) => void;
}

export const CustomConfirmDialog: React.FC<CustomConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  type = "confirm",
  showInput = false,
  inputDefaultValue = "",
  inputPlaceholder = "Type here...",
  onConfirmWithInput,
}) => {
  const [inputValue, setInputValue] = useState(inputDefaultValue);

  // Synchronize state when open
  useEffect(() => {
    if (isOpen) {
      setInputValue(inputDefaultValue);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen, inputDefaultValue]);

  const getIcon = () => {
    switch (type) {
      case "alert":
        return <AlertTriangle className="w-8 h-8 text-amber-400" />;
      case "error":
        return <AlertCircle className="w-8 h-8 text-rose-500" />;
      case "success":
        return <CheckCircle className="w-8 h-8 text-[#a3ff12]" />;
      case "confirm":
      default:
        return <HelpCircle className="w-8 h-8 text-sky-400" />;
    }
  };

  const getBorderColor = () => {
    switch (type) {
      case "alert":
        return "border-amber-400/30";
      case "error":
        return "border-rose-500/30";
      case "success":
        return "border-[#a3ff12]/30";
      case "confirm":
      default:
        return "border-white/10";
    }
  };

  const handleConfirmClick = () => {
    if (showInput && onConfirmWithInput) {
      onConfirmWithInput(inputValue);
    } else {
      onConfirm();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleConfirmClick();
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
          {/* Backdrop Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="fixed inset-0 bg-[#000000]/75 backdrop-blur-md"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: "spring", duration: 0.35, bounce: 0.15 }}
            className={`relative w-full max-w-md overflow-hidden rounded-2xl bg-[#090b10] border p-6 shadow-2xl ${getBorderColor()}`}
          >
            {/* Glow Accent */}
            <div
              className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${
                type === "alert"
                  ? "from-amber-400 to-amber-600"
                  : type === "error"
                  ? "from-rose-500 to-rose-700"
                  : type === "success"
                  ? "from-[#a3ff12] to-emerald-600"
                  : "from-sky-400 to-[#a3ff12]"
              }`}
            />

            {/* Header / Content */}
            <div className="flex gap-4 items-start">
              <div className="p-2 bg-white/5 rounded-xl border border-white/5 shrink-0">
                {getIcon()}
              </div>
              <div className="space-y-1.5 flex-1 min-w-0">
                <h3 className="text-sm font-mono font-bold text-white tracking-wide uppercase">
                  {title}
                </h3>
                <p className="text-xs font-mono text-zinc-400 leading-relaxed break-words">
                  {message}
                </p>
              </div>
            </div>

            {/* Text Input for Prompt */}
            {showInput && (
              <div className="mt-4">
                <input
                  type="text"
                  autoFocus
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={inputPlaceholder}
                  className="w-full bg-[#141822] border border-white/10 rounded-xl px-4 py-3 text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-[#a3ff12] transition-colors shadow-inner"
                />
              </div>
            )}

            {/* Actions Row */}
            <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-white/5">
              {(type === "confirm" || showInput) && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="px-4 py-2 rounded-xl border border-white/10 text-xs font-mono font-semibold text-zinc-400 hover:bg-white/5 hover:text-white transition-colors cursor-pointer"
                >
                  {cancelText}
                </button>
              )}
              <button
                type="button"
                onClick={handleConfirmClick}
                className={`px-4 py-2 rounded-xl text-xs font-mono font-semibold transition-all shadow-md cursor-pointer ${
                  type === "error"
                    ? "bg-rose-600 hover:bg-rose-700 text-white"
                    : type === "alert"
                    ? "bg-amber-500 hover:bg-amber-600 text-black"
                    : "bg-[#a3ff12] hover:bg-[#8ee010] text-black hover:shadow-[0_0_12px_rgba(163,255,18,0.25)] font-bold"
                }`}
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
