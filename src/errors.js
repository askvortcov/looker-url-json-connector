/**
 * An error whose message is safe and useful to show to the person building
 * the data source. Entry points turn it into a Looker Studio user error.
 */
function UserFacingError(message) {
  this.name = 'UserFacingError';
  this.message = message;
  this.isUserFacing = true;
}
UserFacingError.prototype = Object.create(Error.prototype);
