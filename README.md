# Brook Store

This is an implementation of [Brook User System](https://github.com/txthinking/brook/blob/master/protocol/user.md)

## Run Brook Store Server

```
nami install z nico brook_store
z start
```

```
z e HOME $HOME
z e PATH $PATH
```

Config file: `/root/.brook_store.env`

```
# mysql
brook_store_mysql_host=127.0.0.1
brook_store_mysql_port=3306
brook_store_mysql_user=root
brook_store_mysql_password=111111
# redis
brook_store_redis_host=127.0.0.1
brook_store_redis_port=6379
brook_store_redis_db=5
# 32 characters
brook_store_secret=12345678901234567890123456789012
# Your brook store domain
brook_store_domain=golang.cc
brook_store_name_en="Go Cloud"
brook_store_name_zh="Go 云"
brook_store_support=https://t.me/xxx
# Payment link, the USER_ID placeholder will be replaced when click. You can also edit the source code to implement your own payment logic.
brook_store_payment_link=https://xxx.com?user_id=USER_ID
# email
brook_store_smtp_host=xxx
brook_store_smtp_port=xxx
brook_store_smtp_user=xxx
brook_store_smtp_pass=xxx
brook_store_smtp_from=xxx
# See https://www.txthinking.com/zhi.html and https://github.com/txthinkinginc/zhi.js
brook_store_zhi_bot_token=xxx
brook_store_zhi_ChatUUID=xxx
brook_store_zhi_Key=xxx
brook_store_zhi_UserUUID=xxx
brook_store_zhi_Name=xxx
brook_store_zhi_AvatarUUID=xxx
```

```
z brook_store
z nico golang.cc http://127.0.0.1:2609
```

## Get `brook_store_reporter_user_token`

1. Open `https://${brook_store_domain}` in browser
2. Signin/signup with an email
3. Get token value from localStorage in browser
4. Update the user expiration time in the MySQL database to a longer future date: `brook_store.user.expiredat` is the unix timestamp(s)

## Deploy Brook Node

```
nami install z brook brook_store
z start
```

```
z e HOME $HOME
z e PATH $PATH
```

Config file: `/root/.brook_store.env`

```
# See above
brook_store_reporter_user_token=TODO
# Same with above config
brook_store_domain=golang.cc
# Same with above config
brook_store_secret=12345678901234567890123456789012
# See https://www.txthinking.com/zhi.html and https://github.com/txthinkinginc/zhi.js
brook_store_zhi_bot_token=xxx
brook_store_zhi_ChatUUID=xxx
brook_store_zhi_Key=xxx
brook_store_zhi_UserUUID=xxx
brook_store_zhi_Name=xxx
brook_store_zhi_AvatarUUID=xxx
```

```
z brook --cliToken ${CLIToken} --script https://${brook_store_domain}/api/${brook_store_secret}/server.tengo --scriptUpdateInterval 86400 --pid /server.pid --userLog /server.log --userAPI https://${brook_store_domain}/api/${brook_store_secret}/brook-user-api --userMaxConnCount 300 --userTotalSpeedLimit 5000000 server --listen :${port} --password ${password} --tcpTimeout 600
z brook --cliToken ${CLIToken} --script https://${brook_store_domain}/api/server.tengo --scriptUpdateInterval 86400 --pid /wsserver.pid --userLog /wsserver.log --userAPI https://${brook_store_domain}/api/${brook_store_secret}/brook-user-api --userMaxConnCount 300 --userTotalSpeedLimit 5000000 wsserver --listen :${port} --password ${password} --tcpTimeout 600
z brook_store_report --serverport ${port} --wsserverport ${port} --password ${password}
```

> Replace the ${} to correct value, and get CLIToken from Brook Business: https://www.txthinking.com/brook.html

## Online Show

[https://golang.cc](https://golang.cc)
