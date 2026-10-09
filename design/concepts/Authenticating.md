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
  where username and password are not blank, and no user has the given username
  then
    add a new user with username and a verifier securely derived from password
    returns user

signIn(username: String, password: String) : returns (session: Session)
  where a user has the given username, and password matches that user's passwordVerifier
  then
    add a new session with user set to the verified user
    returns session

authenticate(session: Session) : returns (user: User)
  where session exists
  then
    bind user to the session's user
    returns user

signOut(session: Session) : returns ()
  where session exists
  then
    remove session
    returns
```

## Queries

```queries
```
