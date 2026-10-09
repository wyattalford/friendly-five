# Application types

FriendlyFive currently identifies people through Authenticating. The remaining
concept instances will be added as their implementations are completed.

```types
```

```instances
instantiate Authenticating

instantiate Agreeing with
  User is Authenticating.User

instantiate Resolving with
  User is Authenticating.User
  Item is Agreeing.Agreement
```
