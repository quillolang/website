-brand = Quillo Shop

welcome = Welcome to { -brand }, { $name }!
cart-items = { $count ->
    [one] You have one item in your cart.
   *[other] You have { $count } items in your cart.
}
shared-photos = { $user } added { $count ->
    [one] a new photo
   *[other] { $count } new photos
} to { $gender ->
    [male] his album
    [female] her album
   *[other] their album
}.
login = Sign in
    .placeholder = Your e-mail address
    .title = Sign in to { -brand }
