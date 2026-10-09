# Application types

FriendlyFive identifies people through Authenticating. Agreements are the shared
item used by resolution, obligation tracking, and invitation links.

```types
```

```instances
instantiate Authenticating

instantiate Agreeing with
  User is Authenticating.User

instantiate Resolving with
  User is Authenticating.User
  Item is Agreeing.Agreement

instantiate ObligationTracking with
  User is Authenticating.User
  Item is Agreeing.Agreement

instantiate Linking with
  User is Authenticating.User
  Item is Agreeing.Agreement
```
