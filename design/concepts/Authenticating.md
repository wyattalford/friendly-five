# Authenticating

## Purpose

Establish a user's identity so actions can be attributed to the correct account.

## Principle

Wyatt registers a unique username, unique email, and password. A proposal may
first reserve an email for an invited person, who chooses a username and
activates that identity through the application's invitation flow. Matching credentials let Wyatt
sign in and receive a session. The session identifies Wyatt until sign-out,
after which it cannot authenticate another request.

## Types

```types
```

## State

```state
a set of Users with
  an optional unique username String
  a unique email String
  an optional passwordVerifier String

a set of Sessions with
  a user User
  an expiresAt DateTime

Rule: Session identifiers are virtually unguessable, and password verifiers do not store plaintext passwords.
Rule: Registered users have a username, email, and passwordVerifier.
Rule: A user with an email but without a username or passwordVerifier is reserved and cannot sign in. Activation adds its chosen username and passwordVerifier exactly once.
Rule: Emails are trimmed and compared case-insensitively.
```

## Actions

```actions
register(username: String, email: String, password: String) : returns (user: User)
  where username or password is blank, username has email format, or email is invalid
  then
    refuses INVALID_CREDENTIALS "A username, valid email, and password are required."
  where username is already registered
  then
    refuses USERNAME_TAKEN "That username is already registered."
  where email already belongs to a user
  then
    refuses EMAIL_TAKEN "That email is already registered or invited."
  where the inputs are valid, and no user has the given username or normalized email
  then
    add a new user with username, normalized email, and a verifier securely derived from password
    returns user

reserve(email: String) : returns (user: User)
  where email is invalid or its normalized value already belongs to any user
  then
    refuses RESERVATION_NOT_AVAILABLE "That email is already registered or invited."
  where email is valid and available
  then
    add a new user with normalized email, no username, and no passwordVerifier
    returns user

activate(user: User, username: String, password: String) : returns ()
  where username or password is blank, or username has email format
  then
    refuses INVALID_CREDENTIALS "A username and password are required."
  where username already belongs to another user
  then
    refuses USERNAME_TAKEN "That username is already registered."
  where user is unknown or already has a passwordVerifier
  then
    refuses ACTIVATION_NOT_AVAILABLE "This invited account cannot be activated."
  where user is reserved and username and password are nonblank
  then
    set user's username and passwordVerifier to the chosen username and a verifier securely derived from password
    returns

release(user: User) : returns ()
  where user is unknown or already has a passwordVerifier
  then
    refuses RESERVATION_NOT_AVAILABLE "This invited identity is not reserved."
  where user is reserved
  then
    remove user
    returns

signIn(username: String, password: String) : returns (session: Session, expiresAt: DateTime)
  where no user has the given username or password does not match that user's passwordVerifier
  then
    refuses INVALID_CREDENTIALS "The username or password is incorrect."
  where a user has the given username, and password matches that user's passwordVerifier
  then
    delete every expired session
    add a new session with user set to the verified user and expiresAt set to 30 minutes from now
    returns session, expiresAt

authenticate(session: Session) : returns (user: User)
  where session does not exist or is expired
  then
    delete the session if it is expired
    refuses UNKNOWN_SESSION "This session is not active."
  where session exists
  then
    bind user to the session's user
    returns user

signOut(session: Session) : returns ()
  where session does not exist or is expired
  then
    delete the session if it is expired
    refuses UNKNOWN_SESSION "This session is not active."
  where session exists
  then
    remove session
    returns
```

## Queries

```queries
_byUsername(username: String) : optional (user: User)
  Answers the active user with this username, or no row when the username is unknown or reserved.

_byEmail(email: String) : optional (user: User)
  Answers the active user with this normalized email, or no row when the email is unknown or reserved.

_byIdentifier(identifier: String) : optional (user: User)
  When identifier has email format, answers the active user whose normalized email matches it. Otherwise answers the active user whose username exactly matches it. Answers no row when there is no match.

_reserved(user: User) : optional (user: User)
  Answers user when it exists without a passwordVerifier, or no row otherwise.

_username(user: User) : optional (username: String)
  Answers the username for this user, or no row when the user is unknown.

_email(user: User) : optional (email: String)
  Answers the normalized email for this user, or no row when the user is unknown.

_label(user: User) : optional (label: String)
  Answers the username when present, otherwise the reserved email, or no row when the user is unknown.
```
