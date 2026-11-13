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
  Eye,
  EyeOff,
  Smile,
  LogOut,
} from "lucide-react";
import { useTradeStore } from "@/store/useTradeStore";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const user = useTradeStore((s) => s.user);
  const login = useTradeStore((s) => s.login);
  const signup = useTradeStore((s) => s.signup);
  const logout = useTradeStore((s) => s.logout);

  const [mode, setMode] = useState<"LOGIN" | "SIGNUP">("LOGIN");
  const [userId, setUserId] = useState<string>("");
  const [nickname, setNickname] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const resetFormState = () => {
    setUserId("");
    setNickname("");
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setErrorMsg(null);
  };

  const handleClose = () => {
    setErrorMsg(null);
    onClose();
  };

  const handleSwitchMode = (nextMode: "LOGIN" | "SIGNUP") => {
    setMode(nextMode);
    setErrorMsg(null);
    setConfirmPassword("");
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedId = userId.trim();
    const trimmedNickname = nickname.trim();

    if (!trimmedId) {
      setErrorMsg("아이디를 입력해주세요.");
      return;
    }
    if (/\s/.test(trimmedId)) {
      setErrorMsg("아이디에는 공백을 포함할 수 없습니다.");
      return;
    }
    if (!password) {
      setErrorMsg("비밀번호를 입력해주세요.");
      return;
    }

    if (mode === "SIGNUP") {
      if (trimmedId.length < 3 || trimmedId.length > 20) {
        setErrorMsg("아이디는 3~20자로 입력해주세요.");
        return;
      }
      if (password.length < 4) {
        setErrorMsg("비밀번호는 최소 4자 이상으로 설정해주세요.");
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg("비밀번호와 비밀번호 확인이 일치하지 않습니다.");
        return;
      }
    }

    const res =
      mode === "SIGNUP"
        ? signup(trimmedId, password, trimmedNickname || undefined)
        : login(trimmedId, password);

    if (!res.success) {
      setErrorMsg(res.message);
      return;
    }

    resetFormState();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 px-4 backdrop-blur-[2px] animate-fade-in"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-3xl bg-white shadow-2xl border border-gray-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative bg-gradient-to-br from-[#00985f] to-[#007a4c] px-6 pt-5 pb-5 text-white">
          <button
            type="button"
            onClick={handleClose}
            aria-label="닫기"
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-[#00985f] font-black text-base shadow-md">
              PT
            </div>
            <div>
              <h2 className="text-lg font-extrabold tracking-tight">
                PitchTrade {mode === "LOGIN" ? "로그인" : "회원가입"}
              </h2>
              <p className="mt-0.5 text-xs text-emerald-100">
                계정별 독립 자산 및 포트폴리오가 안전하게 보관됩니다
              </p>
            </div>
          </div>
        </div>

        {/* Form Body (Compact spacing for mobile usability + Safe Area bottom padding) */}
        <div className="px-6 pt-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] space-y-4">
          {/* Active Session Notice when opening modal for account switching */}
          {user && (
            <div className="flex items-center justify-between gap-2 rounded-2xl bg-gray-50 border border-gray-200 px-3.5 py-2.5 text-xs">
              <div className="min-w-0">
                <span className="text-gray-500 block text-[11px]">
                  현재 로그인 계정
                </span>
                <p className="font-extrabold text-gray-900 truncate">
                  {user.name}{" "}
                  <span className="font-mono font-normal text-gray-500">
                    (@{user.id})
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  logout();
                  resetFormState();
                }}
                className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-gray-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
              >
                <LogOut className="h-3 w-3" />
                <span>로그아웃</span>
              </button>
            </div>
          )}

          {/* Mode Switcher Tabs (LOGIN / SIGNUP) */}
          <div className="grid grid-cols-2 rounded-2xl bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => handleSwitchMode("LOGIN")}
              className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold transition ${
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
              onClick={() => handleSwitchMode("SIGNUP")}
              className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold transition ${
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
          <form onSubmit={handleSubmitForm} className="space-y-3">
            <div>
              <label
                htmlFor="auth-user-id"
                className="block text-xs font-bold text-gray-700 mb-1"
              >
                아이디
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  id="auth-user-id"
                  type="text"
                  autoComplete="username"
                  value={userId}
                  onChange={(e) => {
                    setUserId(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder={
                    mode === "SIGNUP"
                      ? "3~20자 아이디 입력 (공백 제외)"
                      : "아이디를 입력하세요"
                  }
                  className="h-11 w-full rounded-2xl border border-gray-200 bg-gray-50 pl-10 pr-4 text-sm font-semibold text-gray-900 placeholder:font-normal placeholder:text-gray-400 focus:border-[#00985f] focus:bg-white focus:ring-2 focus:ring-[#00985f]/15 focus:outline-none transition"
                />
              </div>
            </div>

            {mode === "SIGNUP" && (
              <div>
                <label
                  htmlFor="auth-user-nickname"
                  className="block text-xs font-bold text-gray-700 mb-1"
                >
                  닉네임 <span className="font-normal text-gray-400">(선택)</span>
                </label>
                <div className="relative">
                  <Smile className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    id="auth-user-nickname"
                    type="text"
                    autoComplete="nickname"
                    value={nickname}
                    onChange={(e) => {
                      setNickname(e.target.value);
                      if (errorMsg) setErrorMsg(null);
                    }}
                    placeholder="미입력 시 아이디와 동일하게 설정"
                    className="h-11 w-full rounded-2xl border border-gray-200 bg-gray-50 pl-10 pr-4 text-sm font-semibold text-gray-900 placeholder:font-normal placeholder:text-gray-400 focus:border-[#00985f] focus:bg-white focus:ring-2 focus:ring-[#00985f]/15 focus:outline-none transition"
                  />
                </div>
              </div>
            )}

            <div>
              <label
                htmlFor="auth-user-pw"
                className="block text-xs font-bold text-gray-700 mb-1"
              >
                비밀번호
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  id="auth-user-pw"
                  type={showPassword ? "text" : "password"}
                  autoComplete={
                    mode === "LOGIN" ? "current-password" : "new-password"
                  }
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder={
                    mode === "SIGNUP"
                      ? "비밀번호 입력 (최소 4자 이상)"
                      : "비밀번호를 입력하세요"
                  }
                  className="h-11 w-full rounded-2xl border border-gray-200 bg-gray-50 pl-10 pr-10 text-sm font-semibold text-gray-900 placeholder:font-normal placeholder:text-gray-400 focus:border-[#00985f] focus:bg-white focus:ring-2 focus:ring-[#00985f]/15 focus:outline-none transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {mode === "SIGNUP" && (
              <div>
                <label
                  htmlFor="auth-user-pw-confirm"
                  className="block text-xs font-bold text-gray-700 mb-1"
                >
                  비밀번호 확인
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    id="auth-user-pw-confirm"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (errorMsg) setErrorMsg(null);
                    }}
                    placeholder="비밀번호를 한 번 더 입력하세요"
                    className="h-11 w-full rounded-2xl border border-gray-200 bg-gray-50 pl-10 pr-4 text-sm font-semibold text-gray-900 placeholder:font-normal placeholder:text-gray-400 focus:border-[#00985f] focus:bg-white focus:ring-2 focus:ring-[#00985f]/15 focus:outline-none transition"
                  />
                </div>
              </div>
            )}

            {mode === "SIGNUP" && (
              <div className="flex items-center gap-2 rounded-2xl bg-emerald-50/80 px-3.5 py-2.5 text-xs font-semibold text-[#00985f] border border-emerald-200/70">
                <BadgeCheck className="h-4 w-4 shrink-0" />
                <span>신규 가입 즉시 기본 투자금 100,000 P가 지급됩니다.</span>
              </div>
            )}

            {errorMsg && (
              <div className="flex items-center gap-2 rounded-2xl bg-rose-50 px-3.5 py-2.5 text-xs font-bold text-rose-600 border border-rose-200">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#00985f] py-3 text-sm font-extrabold text-white shadow-md shadow-emerald-600/15 transition hover:bg-[#007f4f] active:scale-[0.99]"
            >
              {mode === "LOGIN" ? (
                <>
                  <LogIn className="h-4 w-4" />
                  <span>로그인</span>
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4" />
                  <span>회원가입 완료 및 시작하기</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
