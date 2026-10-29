"use client";

import React, { useState } from "react";
import {
  X,
  User,
  LogIn,
  UserPlus,
  Lock,
  AlertCircle,
  BadgeCheck,
} from "lucide-react";
import { useTradeStore } from "@/store/useTradeStore";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const login = useTradeStore((s) => s.login);
  const signup = useTradeStore((s) => s.signup);

  const [mode, setMode] = useState<"LOGIN" | "SIGNUP">("LOGIN");
  const [userId, setUserId] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleClose = () => {
    setErrorMsg(null);
    onClose();
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedId = userId.trim();

    if (!trimmedId) {
      setErrorMsg("아이디를 입력해주세요.");
      return;
    }
    if (!password) {
      setErrorMsg("비밀번호를 입력해주세요.");
      return;
    }

    const res =
      mode === "SIGNUP"
        ? signup(trimmedId, password)
        : login(trimmedId, password);

    if (!res.success) {
      setErrorMsg(res.message);
      return;
    }

    setUserId("");
    setPassword("");
    setErrorMsg(null);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 px-4 backdrop-blur-[2px] animate-fade-in"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl border border-gray-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Spacious Header */}
        <div className="relative bg-gradient-to-br from-[#00985f] to-[#007a4c] px-8 pt-7 pb-6 text-white">
          <button
            type="button"
            onClick={handleClose}
            aria-label="닫기"
            className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#00985f] font-black text-lg shadow-md">
              PT
            </div>
            <div>
              <h2 className="text-xl font-extrabold tracking-tight">
                PitchTrade {mode === "LOGIN" ? "로그인" : "회원가입"}
              </h2>
              <p className="mt-0.5 text-sm text-emerald-100">
                실시간 축구 선수 시세 트레이딩 플랫폼
              </p>
            </div>
          </div>
        </div>

        {/* Form Body with Enlarged Padding (px-8) */}
        <div className="px-8 pt-6 pb-8 space-y-6">
          {/* Mode Switcher Tabs (LOGIN / SIGNUP) */}
          <div className="grid grid-cols-2 rounded-2xl bg-gray-100 p-1.5">
            <button
              type="button"
              onClick={() => {
                setMode("LOGIN");
                setErrorMsg(null);
              }}
              className={`flex items-center justify-center gap-2 rounded-xl py-3 text-base font-bold transition ${
                mode === "LOGIN"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              <LogIn className="h-4 w-4" />
              <span>로그인</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("SIGNUP");
                setErrorMsg(null);
              }}
              className={`flex items-center justify-center gap-2 rounded-xl py-3 text-base font-bold transition ${
                mode === "SIGNUP"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              <UserPlus className="h-4 w-4" />
              <span>회원가입</span>
            </button>
          </div>

          {/* Login / Signup Form */}
          <form onSubmit={handleSubmitForm} className="space-y-5">
            <div>
              <label
                htmlFor="auth-user-id"
                className="block text-base font-bold text-gray-800 mb-2"
              >
                아이디
              </label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="auth-user-id"
                  type="text"
                  autoComplete="username"
                  value={userId}
                  onChange={(e) => {
                    setUserId(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder="아이디를 입력하세요"
                  className="h-12 w-full rounded-2xl border border-gray-200 bg-[#f8f9fa] pl-12 pr-4 text-lg font-semibold text-gray-900 placeholder:text-base placeholder:font-normal placeholder:text-gray-400 focus:border-[#00985f] focus:bg-white focus:ring-2 focus:ring-[#00985f]/15 focus:outline-none transition"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="auth-user-pw"
                className="block text-base font-bold text-gray-800 mb-2"
              >
                비밀번호
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="auth-user-pw"
                  type="password"
                  autoComplete={
                    mode === "LOGIN" ? "current-password" : "new-password"
                  }
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder="비밀번호를 입력하세요"
                  className="h-12 w-full rounded-2xl border border-gray-200 bg-[#f8f9fa] pl-12 pr-4 text-lg font-semibold text-gray-900 placeholder:text-base placeholder:font-normal placeholder:text-gray-400 focus:border-[#00985f] focus:bg-white focus:ring-2 focus:ring-[#00985f]/15 focus:outline-none transition"
                />
              </div>
            </div>

            {mode === "SIGNUP" && (
              <div className="flex items-center gap-2 rounded-2xl bg-emerald-50/80 px-4 py-3 text-sm font-semibold text-[#00985f] border border-emerald-200/70">
                <BadgeCheck className="h-5 w-5 shrink-0" />
                <span>신규 가입 즉시 기본 투자금 100,000 P가 지급됩니다.</span>
              </div>
            )}

            {errorMsg && (
              <div className="flex items-center gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600 border border-rose-200">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#00985f] py-3.5 text-lg font-bold text-white shadow-md shadow-emerald-600/15 transition hover:bg-[#007f4f] active:scale-[0.99]"
            >
              {mode === "LOGIN" ? (
                <>
                  <LogIn className="h-5 w-5" />
                  <span>로그인</span>
                </>
              ) : (
                <>
                  <UserPlus className="h-5 w-5" />
                  <span>회원가입</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
