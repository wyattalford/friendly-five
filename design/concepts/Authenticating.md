# Authenticating

## Purpose

Establish a user's identity so actions can be attributed to the correct account.

## Principle

Wyatt registers a unique username and password. Matching credentials let Wyatt
sign in and receive a session. The session identifies Wyatt until sign-out,
after which it cannot authenticate another request.

## Types

```types
```

## State

```state
a set of Users with
  a unique username String
  a passwordVerifier String

a set of Sessions with
  a user User

Rule: Session identifiers are virtually unguessable, and password verifiers do not store plaintext passwords.
```

## Actions

```actions
register(username: String, password: String) : returns (user: User)
  where username or password is blank
  then
    refuses INVALID_CREDENTIALS "A username and password are required."
  where username is already registered
  then
    refuses USERNAME_TAKEN "That username is already registered."
  where username and password are not blank, and no user has the given username
  then
    add a new user with username and a verifier securely derived from password
    returns user

signIn(username: String, password: String) : returns (session: Session)
  where no user has the given username or password does not match that user's passwordVerifier
  then
    refuses INVALID_CREDENTIALS "The username or password is incorrect."
  where a user has the given username, and password matches that user's passwordVerifier
  then
    add a new session with user set to the verified user
    returns session

authenticate(session: Session) : returns (user: User)
  where session does not exist
  then
    refuses UNKNOWN_SESSION "This session is not active."
  where session exists
  then
    bind user to the session's user
    returns user

signOut(session: Session) : returns ()
  where session does not exist
  then
    refuses UNKNOWN_SESSION "This session is not active."
  where session exists
  then
    remove session
    returns
```

## Queries

```queries
_byUsername(username: String) : optional (user: User)
  Answers the user with this username, or no row when the username is unknown.
```
