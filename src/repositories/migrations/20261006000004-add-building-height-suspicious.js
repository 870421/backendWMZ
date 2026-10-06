module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      'ALTER TABLE buildings ADD COLUMN height_suspicious BOOLEAN NOT NULL DEFAULT false;'
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('ALTER TABLE buildings DROP COLUMN height_suspicious;');
  }
};
