export const MAX_SIGN_IN_ATTEMPTS = 5;

export type SignInErrorKind =
  | 'invalid-credential'
  | 'wrong-password'
  | 'wrong-email'
  | 'too-many-requests'
  | 'network'
  | 'unknown';

type ErrorWithCode = {
  code?: unknown;
};

export function getSignInErrorKind(error: unknown): SignInErrorKind {
  const code = getErrorCode(error);

  switch (code) {
    case 'auth/invalid-credential':
      return 'invalid-credential';
    case 'auth/wrong-password':
      return 'wrong-password';
    case 'auth/invalid-email':
    case 'auth/user-not-found':
      return 'wrong-email';
    case 'auth/too-many-requests':
      return 'too-many-requests';
    case 'auth/network-request-failed':
      return 'network';
    default:
      return 'unknown';
  }
}

export function getSignInErrorMessage(error: unknown) {
  switch (getSignInErrorKind(error)) {
    case 'invalid-credential':
      return '아이디 또는 비밀번호가 틀렸습니다.';
    case 'wrong-password':
      return '비밀번호가 틀렸습니다.';
    case 'wrong-email':
      return '아이디가 틀렸습니다.';
    case 'too-many-requests':
      return '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.';
    case 'network':
      return '네트워크 연결을 확인한 후 다시 시도해주세요.';
    default:
      return '로그인에 실패했습니다. 잠시 후 다시 시도해주세요.';
  }
}

function getErrorCode(error: unknown) {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null;
  }

  const { code } = error as ErrorWithCode;
  return typeof code === 'string' ? code : null;
}
