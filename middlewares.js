module.exports = {
    logRequest: function(req, res, next) {
        console.log(req.method + ' ' + req.path + '\n');
        next();
    },
    clientError: function(req, res, next) {
        var err = new Error('Not found');
        err.status = 404;
        next(err);
    },
    serverError: function(err, req, res, next) {
        console.error(err.stack);
        res.status(err.status || 500).json({
            message: err.message,
            error: process.env.NODE_ENV === 'production' ? err : {}
        });
    }
};