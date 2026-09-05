# Authentication Sequence Diagrams

## 1. Registration & Email Verification

```mermaid
sequenceDiagram
    actor User
    participant Client
    participant AuthAPI
    participant DB
    participant EmailService

    User->>Client: Enters email, name, password
    Client->>AuthAPI: POST /api/v1/auth/register
    AuthAPI->>DB: Check if email exists
    DB-->>AuthAPI: Not found
    AuthAPI->>AuthAPI: Hash password
    AuthAPI->>DB: Create User (isVerified=false)
    AuthAPI->>DB: Create EmailVerificationToken (hashed)
    AuthAPI->>DB: Create AuditLog
    AuthAPI->>EmailService: Send verification email (raw token)
    AuthAPI-->>Client: 201 Created (Success message)
    
    User->>EmailService: Clicks link with token
    EmailService->>Client: Redirect to app
    Client->>AuthAPI: POST /api/v1/auth/verify-email
    AuthAPI->>DB: Find token by hash
    DB-->>AuthAPI: Valid token
    AuthAPI->>DB: Update User (isVerified=true)
    AuthAPI->>DB: Mark token as used
    AuthAPI-->>Client: 200 OK
```

## 2. Login Flow (Success & Lockout)

```mermaid
sequenceDiagram
    actor User
    participant Client
    participant AuthAPI
    participant DB

    User->>Client: Enters credentials
    Client->>AuthAPI: POST /api/v1/auth/login
    AuthAPI->>DB: Find user by email
    DB-->>AuthAPI: User found
    AuthAPI->>DB: Check lockedUntil
    DB-->>AuthAPI: Not locked
    AuthAPI->>AuthAPI: Compare password hash
    
    alt Password valid
        AuthAPI->>DB: Reset failedLoginAttempts
        AuthAPI->>DB: Create UserSession (hashed token)
        AuthAPI->>DB: Create RefreshToken (hashed, family)
        AuthAPI->>DB: Create LoginAttempt (success)
        AuthAPI-->>Client: 200 OK (AccessToken, RefreshToken)
    else Password invalid
        AuthAPI->>DB: Increment failedLoginAttempts
        alt Attempts >= 5
            AuthAPI->>DB: Set lockedUntil = now + 15m
            AuthAPI->>DB: Create AuditLog (Lockout)
        end
        AuthAPI->>DB: Create LoginAttempt (failure)
        AuthAPI-->>Client: 401 Unauthorized
    end
```

## 3. Token Refresh & Rotation

```mermaid
sequenceDiagram
    participant Client
    participant AuthAPI
    participant DB

    Client->>AuthAPI: POST /api/v1/auth/refresh (refreshToken)
    AuthAPI->>DB: Find token by hash
    
    alt Token Valid & Not Revoked
        AuthAPI->>DB: Mark old token as revoked (replaced)
        AuthAPI->>DB: Create new RefreshToken (same family)
        AuthAPI->>DB: Revoke old UserSession
        AuthAPI->>DB: Create new UserSession
        AuthAPI-->>Client: 200 OK (new AccessToken, new RefreshToken)
    else Token Revoked (Reuse Detected)
        AuthAPI->>DB: Revoke all tokens in family (Compromise!)
        AuthAPI->>DB: Revoke associated UserSessions
        AuthAPI->>DB: Create AuditLog (Family Revoked)
        AuthAPI-->>Client: 401 Unauthorized (Login required)
    end
```

## 4. Password Reset

```mermaid
sequenceDiagram
    actor User
    participant Client
    participant AuthAPI
    participant DB
    participant EmailService

    User->>Client: Request password reset
    Client->>AuthAPI: POST /api/v1/auth/forgot-password
    AuthAPI->>DB: Find user
    AuthAPI->>DB: Create PasswordResetToken (hashed)
    AuthAPI->>EmailService: Send reset link
    AuthAPI-->>Client: 200 OK
    
    User->>Client: Enter new password + token
    Client->>AuthAPI: POST /api/v1/auth/reset-password
    AuthAPI->>DB: Verify token hash
    AuthAPI->>DB: Update password hash & increment tokenVersion
    AuthAPI->>DB: Mark token used
    AuthAPI->>DB: Revoke ALL UserSessions
    AuthAPI->>DB: Revoke ALL RefreshTokens
    AuthAPI-->>Client: 200 OK
```

## 5. Session Revocation

```mermaid
sequenceDiagram
    actor User
    participant Client
    participant AuthAPI
    participant DB

    User->>Client: View active sessions
    Client->>AuthAPI: GET /api/v1/auth/sessions
    AuthAPI->>DB: Fetch active sessions for user
    DB-->>AuthAPI: Session list
    AuthAPI-->>Client: 200 OK
    
    User->>Client: Revoke session X
    Client->>AuthAPI: DELETE /api/v1/auth/sessions/{id}
    AuthAPI->>DB: Update UserSession (revokedAt = now)
    AuthAPI->>DB: Revoke associated RefreshToken
    AuthAPI-->>Client: 200 OK
```
