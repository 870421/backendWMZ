module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS postgis;');
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP EXTENSION IF EXISTS postgis;');
  }
};
