const bcrypt = require('bcrypt');

async function test() {
  const match = await bcrypt.compare('password123', '$2b$10$dCFeU28z6oH7n3vNaP6kgeOqY3Vw2/nc0jGgfR7SePpiwoatHX2vG');
  console.log('Match:', match);
}

test();
