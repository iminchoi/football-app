"use client";

import React, { useState } from "react";
import {
  X,
  User,
  LogIn,
  UserPlus,
  Lock,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Smile,
  LogOut,
  Loader2,
  Coins,
  Info,
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
  const [showConfirmPassword, setShowConfirmPassword] =
    useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const trimmedId = userId.trim();
  const hasIdSpace = /\s/.test(trimmedId);
  const isIdLengthValid = trimmedId.length >= 3 && trimmedId.length <= 20;
  const isIdValid = trimmedId.length > 0 && !hasIdSpace && isIdLengthValid;
  const isPasswordLengthValid = password.length >= 4;
  const hasConfirmInput = confirmPassword.length > 0;
  const isPasswordMatch =
    hasConfirmInput && password.length > 0 && password === confirmPassword;

  const resetFormState = () => {
    setUserId("");
    setNickname("");
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
    setIsSubmitting(false);
    setErrorMsg(null);
  };

  const handleClose = () => {
    if (isSubmitting) return;
    setErrorMsg(null);
    onClose();
  };

  const handleSwitchMode = (nextMode: "LOGIN" | "SIGNUP") => {
    if (isSubmitting) return;
    setMode(nextMode);
    setErrorMsg(null);
    setConfirmPassword("");
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const cleanId = userId.trim();
    const cleanNickname = nickname.trim();

    if (!cleanId) {
      setErrorMsg("아이디를 입력해주세요.");
      return;
    }
    if (/\s/.test(cleanId)) {
      setErrorMsg("아이디에는 공백을 포함할 수 없습니다.");
      return;
    }
    if (!password) {
      setErrorMsg("비밀번호를 입력해주세요.");
      return;
    }

    if (mode === "SIGNUP") {
      if (cleanId.length < 3 || cleanId.length > 20) {
        setErrorMsg("아이디는 3자 이상 20자 이하로 입력해주세요.");
        return;
      }
      if (password.length < 4) {
        setErrorMsg("비밀번호는 최소 4자 이상으로 입력해주세요.");
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg("비밀번호와 비밀번호 확인이 일치하지 않습니다.");
        return;
      }
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    setTimeout(() => {
      const res =
        mode === "SIGNUP"
          ? signup(cleanId, password, cleanNickname || undefined)
          : login(cleanId, password);

      if (!res.success) {
        setErrorMsg(res.message);
        setIsSubmitting(false);
        return;
      }

      resetFormState();
      onClose();
    }, 180);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-gray-900/55 px-4 backdrop-blur-[2px]"
    >
      <div
        className="w-full max-w-[420px] max-h-[92vh] overflow-y-auto rounded-3xl bg-white shadow-[0_20px_50px_rgba(15,23,42,0.18)] border border-gray-200/90"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Unified Modern Fintech Header */}
        <div className="relative border-b border-gray-100 bg-white px-6 pt-6 pb-5">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            aria-label="닫기"
            title="닫기 (X 버튼을 눌러야 닫힙니다)"
            className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-500 transition hover:border-gray-300 hover:bg-gray-100 hover:text-gray-800 active:scale-95 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-3 pr-10">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#00985f] text-white font-black text-base tracking-tight shadow-sm">
              PT
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2
                  id="auth-modal-title"
                  className="text-lg font-extrabold tracking-tight text-gray-900"
                >
                  Pitch<span className="text-[#00985f]">Trade</span>
                </h2>
                <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-extrabold text-[#00985f] border border-emerald-200/80">
                  {mode === "LOGIN" ? "LOGIN" : "SIGN UP"}
                </span>
              </div>
              <p className="mt-1 text-xs font-medium text-gray-500">
                실시간 축구 선수 데이터 기반 시세 트레이딩 플랫폼
              </p>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="px-6 pt-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] space-y-4">
          {/* Active Session Notice when opening modal for account switching */}
          {user && (
            <div className="flex items-center justify-between gap-2 rounded-2xl bg-gray-50 border border-gray-200 px-3.5 py-2.5 text-xs">
              <div className="min-w-0">
                <span className="text-gray-400 font-medium block text-[11px]">
                  현재 접속 중인 계정
                </span>
                <p className="mt-0.5 font-extrabold text-gray-900 truncate">
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
                disabled={isSubmitting}
                className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-gray-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 active:scale-95"
              >
                <LogOut className="h-3 w-3" />
                <span>로그아웃</span>
              </button>
            </div>
          )}

          {/* Unified Mode Switcher Tabs (LOGIN / SIGNUP) */}
          <div
            role="tablist"
            aria-label="인증 모드 선택"
            className="grid grid-cols-2 rounded-2xl bg-gray-100 p-1 border border-gray-200/60"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === "LOGIN"}
              disabled={isSubmitting}
              onClick={() => handleSwitchMode("LOGIN")}
              className={`flex h-10 items-center justify-center gap-1.5 rounded-xl text-xs font-extrabold transition ${
                mode === "LOGIN"
                  ? "bg-white text-gray-900 shadow-xs border border-gray-200/80"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              <LogIn className="h-3.5 w-3.5 text-[#00985f]" />
              <span>로그인</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "SIGNUP"}
              disabled={isSubmitting}
              onClick={() => handleSwitchMode("SIGNUP")}
              className={`flex h-10 items-center justify-center gap-1.5 rounded-xl text-xs font-extrabold transition ${
                mode === "SIGNUP"
                  ? "bg-white text-gray-900 shadow-xs border border-gray-200/80"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              <UserPlus className="h-3.5 w-3.5 text-[#00985f]" />
              <span>회원가입</span>
            </button>
          </div>

          {/* Login / Signup Form (Supports Enter key submit) */}
          <form onSubmit={handleSubmitForm} className="space-y-3.5" noValidate>
            {/* 1. User ID Field */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label
                  htmlFor="auth-user-id"
                  className="text-xs font-extrabold text-gray-800"
                >
                  아이디
                </label>
                {mode === "SIGNUP" ? (
                  <span
                    className={`text-[11px] font-semibold ${
                      trimmedId.length === 0
                        ? "text-gray-400"
                        : isIdValid
                        ? "text-[#00985f]"
                        : "text-rose-500"
                    }`}
                  >
                    {trimmedId.length === 0
                      ? "3~20자 이내 · 공백 불가"
                      : hasIdSpace
                      ? "공백은 사용할 수 없습니다"
                      : isIdLengthValid
                      ? "사용 가능한 아이디 형식입니다"
                      : `현재 ${trimmedId.length}자 (3~20자 필요)`}
                  </span>
                ) : (
                  trimmedId.length > 0 && (
                    <span className="text-[11px] font-medium text-[#00985f]">
                      입력됨
                    </span>
                  )
                )}
              </div>
              <div className="relative">
                <User
                  className={`absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors ${
                    trimmedId.length > 0 ? "text-[#00985f]" : "text-gray-400"
                  }`}
                />
                <input
                  id="auth-user-id"
                  type="text"
                  autoComplete="username"
                  disabled={isSubmitting}
                  value={userId}
                  onChange={(e) => {
                    setUserId(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder={
                    mode === "SIGNUP"
                      ? "아이디 입력 (3~20자, 공백 제외)"
                      : "등록된 아이디를 입력하세요"
                  }
                  className="h-12 w-full rounded-2xl border border-gray-200 bg-gray-50/70 pl-10 pr-10 text-sm font-semibold text-gray-900 placeholder:text-[13px] placeholder:font-normal placeholder:text-gray-400 focus:border-[#00985f] focus:bg-white focus:ring-2 focus:ring-[#00985f]/15 focus:outline-none transition disabled:opacity-60"
                />
                {mode === "SIGNUP" && isIdValid && (
                  <CheckCircle2 className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#00985f]" />
                )}
              </div>
            </div>

            {/* 2. Nickname Field (SIGNUP only) */}
            {mode === "SIGNUP" && (
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label
                    htmlFor="auth-user-nickname"
                    className="text-xs font-extrabold text-gray-800"
                  >
                    닉네임{" "}
                    <span className="font-semibold text-gray-400">
                      (선택 입력)
                    </span>
                  </label>
                  <span className="text-[11px] font-medium text-gray-400">
                    미입력 시 아이디로 자동 설정
                  </span>
                </div>
                <div className="relative">
                  <Smile
                    className={`absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors ${
                      nickname.trim().length > 0
                        ? "text-[#00985f]"
                        : "text-gray-400"
                    }`}
                  />
                  <input
                    id="auth-user-nickname"
                    type="text"
                    autoComplete="nickname"
                    disabled={isSubmitting}
                    value={nickname}
                    onChange={(e) => {
                      setNickname(e.target.value);
                      if (errorMsg) setErrorMsg(null);
                    }}
                    placeholder={
                      trimmedId
                        ? `미입력 시 '${trimmedId}'(으)로 표시됩니다`
                        : "표시될 닉네임을 입력하세요 (선택)"
                    }
                    className="h-12 w-full rounded-2xl border border-gray-200 bg-gray-50/70 pl-10 pr-4 text-sm font-semibold text-gray-900 placeholder:text-[13px] placeholder:font-normal placeholder:text-gray-400 focus:border-[#00985f] focus:bg-white focus:ring-2 focus:ring-[#00985f]/15 focus:outline-none transition disabled:opacity-60"
                  />
                </div>
              </div>
            )}

            {/* 3. Password Field */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label
                  htmlFor="auth-user-pw"
                  className="text-xs font-extrabold text-gray-800"
                >
                  비밀번호
                </label>
                {mode === "SIGNUP" ? (
                  <span
                    className={`text-[11px] font-semibold ${
                      password.length === 0
                        ? "text-gray-400"
                        : isPasswordLengthValid
                        ? "text-[#00985f]"
                        : "text-rose-500"
                    }`}
                  >
                    {password.length === 0
                      ? "최소 4자 이상 입력"
                      : isPasswordLengthValid
                      ? "사용 가능한 비밀번호입니다"
                      : "최소 4자 이상 입력해주세요"}
                  </span>
                ) : (
                  password.length > 0 && (
                    <span className="text-[11px] font-medium text-[#00985f]">
                      입력됨
                    </span>
                  )
                )}
              </div>
              <div className="relative">
                <Lock
                  className={`absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors ${
                    password.length > 0 ? "text-[#00985f]" : "text-gray-400"
                  }`}
                />
                <input
                  id="auth-user-pw"
                  type={showPassword ? "text" : "password"}
                  autoComplete={
                    mode === "LOGIN" ? "current-password" : "new-password"
                  }
                  disabled={isSubmitting}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder={
                    mode === "SIGNUP"
                      ? "비밀번호를 입력하세요 (최소 4자 이상)"
                      : "비밀번호를 입력하세요"
                  }
                  className="h-12 w-full rounded-2xl border border-gray-200 bg-gray-50/70 pl-10 pr-10 text-sm font-semibold text-gray-900 placeholder:text-[13px] placeholder:font-normal placeholder:text-gray-400 focus:border-[#00985f] focus:bg-white focus:ring-2 focus:ring-[#00985f]/15 focus:outline-none transition disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={
                    showPassword ? "비밀번호 숨기기" : "비밀번호 보기"
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* 4. Confirm Password Field (SIGNUP only, with real-time match feedback) */}
            {mode === "SIGNUP" && (
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label
                    htmlFor="auth-user-pw-confirm"
                    className="text-xs font-extrabold text-gray-800"
                  >
                    비밀번호 확인
                  </label>
                  <span
                    className={`text-[11px] font-semibold ${
                      !hasConfirmInput
                        ? "text-gray-400"
                        : isPasswordMatch
                        ? "text-[#00985f]"
                        : "text-rose-500"
                    }`}
                  >
                    {!hasConfirmInput
                      ? "동일한 비밀번호 재입력"
                      : isPasswordMatch
                      ? "비밀번호가 일치합니다"
                      : "비밀번호가 일치하지 않습니다"}
                  </span>
                </div>
                <div className="relative">
                  <Lock
                    className={`absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors ${
                      isPasswordMatch
                        ? "text-[#00985f]"
                        : hasConfirmInput
                        ? "text-rose-500"
                        : "text-gray-400"
                    }`}
                  />
                  <input
                    id="auth-user-pw-confirm"
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    disabled={isSubmitting}
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (errorMsg) setErrorMsg(null);
                    }}
                    placeholder="비밀번호를 한 번 더 입력하세요"
                    className={`h-12 w-full rounded-2xl border bg-gray-50/70 pl-10 pr-10 text-sm font-semibold text-gray-900 placeholder:text-[13px] placeholder:font-normal placeholder:text-gray-400 focus:bg-white focus:outline-none transition disabled:opacity-60 ${
                      !hasConfirmInput
                        ? "border-gray-200 focus:border-[#00985f] focus:ring-2 focus:ring-[#00985f]/15"
                        : isPasswordMatch
                        ? "border-[#00985f] focus:border-[#00985f] focus:ring-2 focus:ring-[#00985f]/15"
                        : "border-rose-300 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/15"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    aria-label={
                      showConfirmPassword
                        ? "비밀번호 확인 숨기기"
                        : "비밀번호 확인 보기"
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* 5. Welcome Bonus 100,000 PT Fintech Card (SIGNUP only) */}
            {mode === "SIGNUP" && (
              <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/60 p-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#00985f] text-white">
                      <Coins className="h-4 w-4" />
                    </div>
                    <div>
                      <span className="block text-[11px] font-bold text-emerald-800">
                        신규 계좌 개설 웰컴 시드머니
                      </span>
                      <span className="font-mono text-sm font-black text-[#00985f]">
                        +100,000 PT 즉시 지급
                      </span>
                    </div>
                  </div>
                  <span className="rounded-lg bg-white px-2 py-1 text-[10px] font-extrabold text-[#00985f] border border-emerald-200/80">
                    무료 지급
                  </span>
                </div>
                <div className="mt-2.5 flex items-center gap-1.5 border-t border-emerald-200/60 pt-2 text-[11px] text-gray-600">
                  <Info className="h-3.5 w-3.5 shrink-0 text-[#00985f]" />
                  <span>
                    <strong>PT</strong>는 실제 화폐가 아닌 서비스 내 가상 투자 포인트입니다.
                  </span>
                </div>
              </div>
            )}

            {/* Error Alert Banner */}
            {errorMsg && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-2xl bg-rose-50 px-3.5 py-2.5 text-xs font-bold text-rose-600 border border-rose-200"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Primary Submit Action Button (Hover, Active, Loading states) */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#00985f] text-sm font-extrabold text-white shadow-sm transition hover:bg-[#008552] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-65"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>
                    {mode === "LOGIN"
                      ? "로그인 확인 중..."
                      : "계정 생성 및 시드머니 지급 중..."}
                  </span>
                </>
              ) : mode === "LOGIN" ? (
                <>
                  <LogIn className="h-4 w-4" />
                  <span>로그인</span>
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4" />
                  <span>회원가입 및 100,000 PT 받기</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
