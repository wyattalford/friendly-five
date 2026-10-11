# Application types

FriendlyFive identifies people through Authenticating and binds each external
User and Item type to the concept instance that owns that identity.

```types
```

```instances
instantiate Authenticating

instantiate Agreeing with
  User is Authenticating.User

instantiate Linking with
  User is Authenticating.User
  Item is Agreeing.Agreement

instantiate Resolving with
  User is Authenticating.User
  Item is Agreeing.Agreement

instantiate ObligationTracking with
  User is Authenticating.User
  Item is Agreeing.Agreement
```
