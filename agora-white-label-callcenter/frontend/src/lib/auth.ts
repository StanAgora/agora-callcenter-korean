const AUTH_KEY = 'cwc_auth'
const VALID_USER = 'agora'
const VALID_PASS = 'agora'

export function login(username: string, password: string): boolean {
  if (username === VALID_USER && password === VALID_PASS) {
    localStorage.setItem(AUTH_KEY, '1')
    return true
  }
  return false
}

export function logout(): void {
  localStorage.removeItem(AUTH_KEY)
}

export function isAuthenticated(): boolean {
  return localStorage.getItem(AUTH_KEY) === '1'
}
