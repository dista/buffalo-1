# buffalo server
  A server backed by nodejs. 

  * It implement a protocal that supporting phone to send control command to embed device.
  * It can use multi-cores advantage, will start same number of process as cpu core
  * It based on nodejs, so it is asynced and epoll powered
  * It can use sqlite or mysql as db engine
  
# depends:
```
  apt-get install g++ git mysql-client mysql-server

  wget http://download.redis.io/releases/redis-2.8.13.tar.gz
  tar xzf redis-2.8.13.tar.gz
  cd redis-2.8.13
  make
  cd utils
  bash install_server.sh

  wget http://nodejs.org/dist/v0.10.30/node-v0.10.30.tar.gz
  tar -xf node-v0.10.30.tar.gz
  cd node-v0.10.30
  ./configure --prefix=/usr
  make install
  
  mysql
  $ GRANT ALL PRIVILEGES ON * . * TO 'buffalox'@'localhost' identified by 'buffalox';
```
