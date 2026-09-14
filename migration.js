import helper from './helper.js'

var migration = async function(db) {
    await helper.migrate(db, 'create user table', `
CREATE TABLE user (
    id int(10) unsigned NOT NULL AUTO_INCREMENT,
    email varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
    expiredat int(11) not null,
    createdat int(11) not null,
    promoter_user_id int(11) not null default 0,
    PRIMARY KEY (id),
    UNIQUE KEY (email),
    KEY (createdat),
    KEY (promoter_user_id)
) ENGINE=InnoDB AUTO_INCREMENT=1000 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    await helper.migrate(db, 'create server table', `
CREATE TABLE server (
    id int(10) unsigned NOT NULL AUTO_INCREMENT,
    hash varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
    brooklink text,
    connectionnumber int(11) not null,
    reportedat int(11) not null,
    createdat int(11) not null,
    PRIMARY KEY (id),
    UNIQUE KEY (hash),
    KEY(connectionnumber),
    KEY(reportedat)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    await helper.migrate(db, 'create payment table', `
CREATE TABLE payment (
    id int(10) unsigned NOT NULL AUTO_INCREMENT,
    user_id int(11) not null,
    method varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
    transactionid varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
    product varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
    amount int(11) not null,
    status int(11) not null, -- 1 unpaid 2 paid 3 refund
    updatedat int(11) not null,
    createdat int(11) not null,
    promoter_user_id int(11) not null default 0,
    PRIMARY KEY (id),
    KEY(user_id),
    KEY(promoter_user_id, status)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
}
export default migration;
