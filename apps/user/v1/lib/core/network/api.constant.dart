class ApiConstants {
  static const String AUTH_GOOGLE = '/auth/google';
  static const String AUTH_REFRESH = '/auth/refresh';
  static const String AUTH_LOGOUT = '/auth/logout';
  static const String AUTH_ME = '/auth/me';
  static const String USER_ME = '/me';
  static const String USER_LOCATION = '/me/location';
  static const String SAVED_PLACES = '/me/saved-places';
  static const String NOTIFICATIONS = '/me/notifications';
  static const String RIDES = '/rides';
  static const String QUOTE = '/rides/quote';
  static const String PAYMENT_METHODS = '/me/payment-methods';
  static const String EMERGENCY_CONTACTS = '/me/emergency-contacts';
  static const String SUPPORT_TICKETS = '/support/tickets';
  static const String RECEIPT_SUFFIX = '/receipt';
  static const String REVIEW_SUFFIX = '/reviews';
  static const String CANCEL_SUFFIX = '/cancel';
  static const String CHECKOUT = '/payments/checkout';
  static const String IDP_HEADER = 'Idempotency-Key';
  static const String ACCESS_TOKEN_KEY = 'access_token';
  static const String REFRESH_TOKEN_KEY = 'refresh_token';
  static const String CACHED_LOCATION_LATITUDE_KEY = 'cached_location_latitude';
  static const String CACHED_LOCATION_LONGITUDE_KEY =
      'cached_location_longitude';
}
